import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSlug } from "@/lib/content";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type CreateLocationPayload = {
  address?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  description?: string | null;
  heroImage?: string | null;
  isActive?: boolean;
  name?: string;
  openingHours?: string | null;
  sortOrder?: number;
  whatsappPhone?: string | null;
};

type ServiceRoleClient = NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>;

async function buildUniqueLocationSlug(
  serviceRoleClient: ServiceRoleClient,
  value: string,
  excludeId?: string,
) {
  const baseSlug = createSlug(value) || "location";
  let query = serviceRoleClient
    .from("store_locations")
    .select("id, slug")
    .ilike("slug", `${baseSlug}%`);

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

function revalidateLocationPages(slug?: string, previousSlug?: string) {
  revalidateTag("locations", "max");
  revalidatePath("/", "page");
  revalidatePath("/locations", "page");
  revalidatePath("/registry", "page");
  revalidatePath("/registry/products", "page");

  if (previousSlug) {
    revalidatePath(`/locations/${previousSlug}`, "page");
  }
  if (slug) {
    revalidatePath(`/locations/${slug}`, "page");
  }
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

  const payload = (await request.json().catch(() => null)) as CreateLocationPayload | null;
  const name = payload?.name?.trim() ?? "";
  const address = payload?.address?.trim() ?? "";

  if (!name || !address) {
    return NextResponse.json(
      { message: "Location name and address are required." },
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

  let slug = "location";
  try {
    slug = await buildUniqueLocationSlug(serviceRoleClient, name);
  } catch (error) {
    console.error("Failed to build location slug.", error);
    return NextResponse.json(
      { message: "Could not prepare the location right now." },
      { status: 500 },
    );
  }

  const { data: location, error } = await serviceRoleClient
    .from("store_locations")
    .insert({
      address,
      contact_email: payload?.contactEmail?.trim() || null,
      contact_phone: payload?.contactPhone?.trim() || null,
      description: payload?.description?.trim() || null,
      hero_image: payload?.heroImage?.trim() || null,
      is_active: payload?.isActive ?? true,
      name,
      opening_hours: payload?.openingHours?.trim() || null,
      slug,
      sort_order: Math.max(0, Math.round(Number(payload?.sortOrder ?? 0))),
      updated_at: new Date().toISOString(),
      whatsapp_phone: payload?.whatsappPhone?.trim() || null,
    })
    .select("*")
    .single();

  if (error?.code === "42P01") {
    return NextResponse.json(
      { message: "Run the packages and locations migration before creating locations." },
      { status: 400 },
    );
  }

  if (error?.code === "23505") {
    return NextResponse.json(
      {
        message:
          "A location like this already exists. Try changing the location name slightly.",
      },
      { status: 400 },
    );
  }

  if (error?.code === "42703") {
    return NextResponse.json(
      { message: "Run the latest store locations migration before creating locations." },
      { status: 400 },
    );
  }

  if (error || !location) {
    console.error("Failed to create location.", error);
    return NextResponse.json(
      { message: "Could not create the location right now." },
      { status: 500 },
    );
  }

  revalidateLocationPages(slug);

  return NextResponse.json({
    location,
    message: "Location created successfully.",
  });
}
