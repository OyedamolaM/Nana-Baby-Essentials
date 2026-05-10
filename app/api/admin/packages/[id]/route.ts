import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSlug } from "@/lib/content";
import { normalizeExternalVideoUrl } from "@/lib/specialPackages";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type UpdatePackagePayload = {
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

async function buildUniquePackageSlug(
  serviceRoleClient: ServiceRoleClient,
  value: string,
  excludeId: string,
) {
  const baseSlug = createSlug(value) || "special-package";
  const { data, error } = await serviceRoleClient
    .from("special_packages")
    .select("id, slug")
    .ilike("slug", `${baseSlug}%`)
    .neq("id", excludeId);

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
  excludeProductId: number,
) {
  const baseSlug = `special-package-${createSlug(value) || "package"}`;
  const { data, error } = await serviceRoleClient
    .from("products")
    .select("id, slug")
    .ilike("slug", `${baseSlug}%`)
    .neq("id", excludeProductId);

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

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/packages/[id]">,
) {
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

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as UpdatePackagePayload | null;
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

  const { data: existingPackage, error: existingPackageError } = await serviceRoleClient
    .from("special_packages")
    .select("id, product_id, slug")
    .eq("id", id)
    .single();

  if (existingPackageError?.code === "42P01") {
    return NextResponse.json(
      { message: "Run the packages and locations migration before editing packages." },
      { status: 400 },
    );
  }

  if (existingPackageError || !existingPackage) {
    return NextResponse.json(
      { message: "Package not found." },
      { status: 404 },
    );
  }

  let packageSlug = existingPackage.slug;
  let productSlug = `special-package-${createSlug(title) || "package"}`;
  try {
    packageSlug = await buildUniquePackageSlug(serviceRoleClient, title, id);
    productSlug = await buildUniqueProductSlug(
      serviceRoleClient,
      title,
      Number(existingPackage.product_id),
    );
  } catch (error) {
    console.error("Failed to build package slugs.", error);
    return NextResponse.json(
      { message: "Could not prepare the package right now." },
      { status: 500 },
    );
  }

  const { error: productUpdateError } = await serviceRoleClient
    .from("products")
    .update({
      category: packageType === "swoop_package" ? "Swoop Packages" : "Gift Bundles",
      cost_price: nextPrice,
      description: subtitle || details || title,
      image,
      in_stock: payload?.isActive ?? true,
      name: title,
      price: nextPrice,
      product_kind: "special_package",
      selling_price: nextPrice,
      slug: productSlug,
    })
    .eq("id", existingPackage.product_id);

  if (productUpdateError) {
    console.error("Failed to update package product.", productUpdateError);
    return NextResponse.json(
      { message: "Could not update the package product right now." },
      { status: 500 },
    );
  }

  const { data: pkg, error: packageUpdateError } = await serviceRoleClient
    .from("special_packages")
    .update({
      badge_text: payload?.badgeText?.trim() || null,
      details,
      external_video_url: normalizeExternalVideoUrl(payload?.externalVideoUrl),
      is_active: payload?.isActive ?? true,
      override_image: image,
      package_type: packageType,
      slug: packageSlug,
      sort_order: Math.max(0, Math.round(Number(payload?.sortOrder ?? 0))),
      subtitle,
      title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*, products(*)")
    .single();

  if (packageUpdateError?.code === "23505") {
    return NextResponse.json(
      {
        message:
          "A package like this already exists. Try changing the package title slightly.",
      },
      { status: 400 },
    );
  }

  if (packageUpdateError || !pkg) {
    console.error("Failed to update special package.", packageUpdateError);
    return NextResponse.json(
      { message: "Could not update the package right now." },
      { status: 500 },
    );
  }

  revalidatePackagePages();

  return NextResponse.json({
    message: "Package updated successfully.",
    package: pkg,
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/admin/packages/[id]">,
) {
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

  const { id } = await context.params;
  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { data: existingPackage, error: existingPackageError } = await serviceRoleClient
    .from("special_packages")
    .select("id, product_id")
    .eq("id", id)
    .single();

  if (existingPackageError || !existingPackage) {
    return NextResponse.json(
      { message: "Package not found." },
      { status: 404 },
    );
  }

  const { error: packageDeleteError } = await serviceRoleClient
    .from("special_packages")
    .delete()
    .eq("id", id);

  if (packageDeleteError) {
    return NextResponse.json(
      { message: "Could not delete the package right now." },
      { status: 400 },
    );
  }

  await serviceRoleClient.from("products").delete().eq("id", existingPackage.product_id);

  revalidatePackagePages();

  return NextResponse.json({
    message: "Package deleted successfully.",
  });
}
