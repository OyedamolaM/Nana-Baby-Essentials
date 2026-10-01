import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const admin = await requireAdminRoute(request);
  if (admin.response) return admin.response;
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Store connection unavailable." }, { status: 500 });
  const { data, error } = await client.from("store_promos").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ message: "Could not load promos. Ensure the promo migration is applied." }, { status: 500 });
  return NextResponse.json({ promos: data });
}

export async function POST(request: Request) {
  const admin = await requireAdminRoute(request);
  if (admin.response) return admin.response;
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Store connection unavailable." }, { status: 500 });
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const percentage = Number(body?.percentage);
  const date = (value: unknown) => value === null || value === "" || value === undefined ? null : typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
  const startsAt = date(body?.startsAt);
  const endsAt = date(body?.endsAt);
  if (!/^[A-Z0-9_-]{2,40}$/.test(code) || !Number.isFinite(percentage) || percentage <= 0 || percentage >= 100 || startsAt === undefined || endsAt === undefined || (startsAt && endsAt && startsAt >= endsAt)) {
    return NextResponse.json({ message: "Enter a code of 2–40 letters, numbers, dashes or underscores, a percentage above 0 and below 100, and an expiry after the start." }, { status: 400 });
  }
  const payload = { code, percentage: Math.round(percentage * 100) / 100, starts_at: startsAt, ends_at: endsAt, is_active: body?.isActive === true };
  const result = body?.id
    ? await client.from("store_promos").update(payload).eq("id", body.id).select("id").single()
    : await client.from("store_promos").insert(payload).select("id").single();
  if (result.error) return NextResponse.json({ message: result.error.code === "23505" ? "That promo code already exists." : "Could not save this promo." }, { status: 400 });
  return NextResponse.json({ message: "Promo saved." });
}
