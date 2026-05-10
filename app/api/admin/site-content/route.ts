import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type SiteContentEntryPayload = {
  key?: string;
  value?: unknown;
};

type UpdateSiteContentPayload = {
  entries?: SiteContentEntryPayload[];
};

const ALLOWED_KEYS = new Set(["hero_image", "about_images"]);

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

  const payload = (await request.json().catch(() => null)) as UpdateSiteContentPayload | null;
  const entries = (payload?.entries ?? []).filter((entry): entry is SiteContentEntryPayload => {
    return (
      typeof entry?.key === "string" &&
      ALLOWED_KEYS.has(entry.key) &&
      entry.value !== undefined
    );
  });

  if (entries.length === 0) {
    return NextResponse.json(
      { message: "No valid site content changes were provided." },
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

  const rows = entries.map((entry) => ({
    key: entry.key,
    value: entry.value,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await serviceRoleClient
    .from("site_content_settings")
    .upsert(rows, { onConflict: "key" })
    .select("*");

  if (error) {
    console.error("Failed to save site content.", error);
    return NextResponse.json(
      { message: "Could not save the homepage content right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    entries: data ?? [],
    message: "Homepage content updated successfully.",
  });
}
