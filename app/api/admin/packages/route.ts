import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSlug } from "@/lib/content";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type CreatePackagePayload = {
  badgeText?: string | null;
  details?: string | null;
  externalVideoUrl?: string | null;
  image?: string | null;
  isActive?: boolean;
  packageType?: "gift_bundle" | "swoop_package";
  price?: number;
  sortOrder?: number;
  subtitle?: string | null;
  title?: string;
};

type ServiceRoleClient = NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>;

async function buildUniqueSlug(
  serviceRoleClient: ServiceRoleClient,
  table: "special_packages" | "store_locations",
  value: string,
  fallback: string,
  excludeId?: string,
) {
  const baseSlug = createSlug(value) || fallback;
  let query = serviceRoleClient.from(table).select("id, slug").ilike("slug", `${baseSlug}%`);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const existingSlugs = new Set(
    (data ?? [])
      .map((row) => row.slug?.trim().toLowerCase())
      .filter((slug): slug is string => Boolean(slug)),
  );

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

async function buildUniqueProductSlug(
  serviceRoleClient: ServiceRoleClient,
  value: string,
  excludeId?: number,
) {
  const baseSlug = `special-package-${createSlug(value) || "package"}`;
  let query = serviceRoleClient.from("products").select("id, slug").ilike("slug", `${baseSlug}%`);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const existingSlugs = new Set(
    (data ?? [])
      .map((row) => row.slug?.trim().toLowerCase())
      .filter((slug): slug is string => Boolean(slug)),
  );

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

function revalidatePackagePages() {
  revalidateTag("packages", "max");
  revalidatePath("/", "page");
  revalidatePath("/registry", "page");
  revalidatePath("/registry/products", "page");
}

export async function POST(request: Request) {
  const admin = await requireAdminRoute(request);
  if (admin.response) {
    return admin.response;
  }

  if (!hasSupabaseServiceRoleEnv) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const payload = (await request.json().catch(() => null)) as CreatePackagePayload | null;
  const title = payload?.title?.trim() ?? "";
  const subtitle = payload?.subtitle?.trim() ?? "";
  const details = payload?.details?.trim() ?? "";
  const image = payload?.image?.trim() ?? "";
  const packageType =
    payload?.packageType === "gift_bundle" ? "gift_bundle" : "swoop_package";
  const nextPrice = Number(payload?.price ?? 0);

  if (!title || !subtitle || !details || !image || !Number.isFinite(nextPrice) || nextPrice <= 0) {
    return NextResponse.json(
      { message: "Title, description, details, image, and a valid price are required." },
      { status: 400 },
    );
  }

  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  let packageSlug = "special-package";
  let productSlug = "special-package";
  try {
    packageSlug = await buildUniqueSlug(
      serviceRoleClient,
      "special_packages",
      title,
      "special-package",
    );
    productSlug = await buildUniqueProductSlug(serviceRoleClient, title);
  } catch (error) {
    console.error("Failed to build package slugs.", error);
    return NextResponse.json(
      { message: "Could not prepare the package right now." },
      { status: 500 },
    );
  }

  const productPayload = {
    category: packageType === "swoop_package" ? "Swoop Packages" : "Gift Bundles",
    cost_price: nextPrice,
    description: subtitle || details || title,
    featured_sort_order: 0,
    image,
    in_stock: payload?.isActive ?? true,
    is_featured: false,
    name: title,
    price: nextPrice,
    product_kind: "special_package",
    selling_price: nextPrice,
    slug: productSlug,
  };

  const { data: productRow, error: productInsertError } = await serviceRoleClient
    .from("products")
    .insert(productPayload)
    .select("id")
    .single();

  if (productInsertError?.code === "42P01") {
    return NextResponse.json(
      { message: "Run the packages and locations migration before creating packages." },
      { status: 400 },
    );
  }

  if (productInsertError || !productRow) {
    console.error("Failed to create package product.", productInsertError);
    return NextResponse.json(
      { message: "Could not create the package right now." },
      { status: 500 },
    );
  }

  const { data: pkg, error: packageInsertError } = await serviceRoleClient
    .from("special_packages")
    .insert({
      badge_text: payload?.badgeText?.trim() || null,
      details,
      external_video_url: payload?.externalVideoUrl?.trim() || null,
      is_active: payload?.isActive ?? true,
      override_image: image,
      package_type: packageType,
      product_id: Number(productRow.id),
      slug: packageSlug,
      sort_order: Math.max(0, Math.round(Number(payload?.sortOrder ?? 0))),
      subtitle,
      title,
      updated_at: new Date().toISOString(),
    })
    .select("*, products(*)")
    .single();

  if (packageInsertError) {
    await serviceRoleClient.from("products").delete().eq("id", productRow.id);

    if (packageInsertError.code === "42P01") {
      return NextResponse.json(
        { message: "Run the packages and locations migration before creating packages." },
        { status: 400 },
      );
    }

    if (packageInsertError.code === "23505") {
      return NextResponse.json(
        {
          message:
            "A package like this already exists. Try changing the package title slightly.",
        },
        { status: 400 },
      );
    }

    console.error("Failed to create special package.", packageInsertError);
    return NextResponse.json(
      { message: "Could not create the package right now." },
      { status: 500 },
    );
  }

  revalidatePackagePages();

  return NextResponse.json({
    message: "Package created successfully.",
    package: pkg,
  });
}
