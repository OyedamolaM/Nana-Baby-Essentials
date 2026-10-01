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
  const promoType = body?.promoType ?? "products";
  if (!["products", "delivery_discount", "free_delivery"].includes(promoType)) {
    return NextResponse.json({ message: "Choose a valid promo type." }, { status: 400 });
  }
  const maximumInput = body?.maximumDiscountAmount;
  const maximumDiscountAmount = maximumInput === undefined || maximumInput === null || maximumInput === "" ? null : Number(maximumInput);
  if (maximumDiscountAmount !== null && ((typeof maximumInput !== "number" && typeof maximumInput !== "string") || !Number.isFinite(maximumDiscountAmount) || maximumDiscountAmount < 0.01 || maximumDiscountAmount > 999999999999.99)) {
    return NextResponse.json({ message: "Enter a maximum discount of at least NGN 0.01, or leave it blank." }, { status: 400 });
  }
  const appliesToStore = body?.appliesToStore === undefined ? true : body.appliesToStore === true;
  const appliesToRegistry = body?.appliesToRegistry === true;
  if ((!appliesToStore && !appliesToRegistry) || (promoType !== "products" && appliesToRegistry)) {
    return NextResponse.json({ message: "Enable at least one checkout. Delivery promos apply to store checkout; registry gifts do not charge a delivery fee." }, { status: 400 });
  }
  const minimumInput = body?.minimumPurchaseAmount;
  const minimumPurchaseAmount = minimumInput === undefined || minimumInput === null || minimumInput === "" ? 0 : Number(minimumInput);
  if ((minimumInput !== undefined && minimumInput !== null && typeof minimumInput !== "string" && typeof minimumInput !== "number") || !Number.isFinite(minimumPurchaseAmount) || minimumPurchaseAmount < 0 || minimumPurchaseAmount > 999999999999.99) {
    return NextResponse.json({ message: "Enter a valid minimum purchase amount of zero or more, in naira." }, { status: 400 });
  }
  const date = (value: unknown) => value === null || value === "" || value === undefined ? null : typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
  const startsAt = date(body?.startsAt);
  const endsAt = date(body?.endsAt);
  if (!/^[A-Z0-9_-]{2,40}$/.test(code) || !Number.isFinite(percentage) || percentage <= 0 || percentage >= 100 || startsAt === undefined || endsAt === undefined || (startsAt && endsAt && startsAt >= endsAt)) {
    return NextResponse.json({ message: "Enter a code of 2–40 letters, numbers, dashes or underscores, a percentage above 0 and below 100, and an expiry after the start." }, { status: 400 });
  }
  const payload = { code, percentage: Math.round(percentage * 100) / 100, promo_type: promoType, maximum_discount_amount: maximumDiscountAmount === null ? null : Math.round(maximumDiscountAmount * 100) / 100, applies_to_store: appliesToStore, applies_to_registry: appliesToRegistry, minimum_purchase_amount: Math.round(minimumPurchaseAmount * 100) / 100, starts_at: startsAt, ends_at: endsAt, is_active: body?.isActive === true };
  const result = body?.id
    ? await client.from("store_promos").update(payload).eq("id", body.id).select("id").single()
    : await client.from("store_promos").insert(payload).select("id").single();
  if (result.error) return NextResponse.json({ message: result.error.code === "23505" ? "That promo code already exists." : "Could not save this promo." }, { status: 400 });
  return NextResponse.json({ message: "Promo saved." });
}

export async function DELETE(request: Request) {
  const admin = await requireAdminRoute(request);
  if (admin.response) return admin.response;
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Store connection unavailable." }, { status: 500 });
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
    return NextResponse.json({ message: "Choose a valid promo to delete." }, { status: 400 });
  }
  const { error } = await client.from("store_promos").delete().eq("id", body.id);
  if (error) return NextResponse.json({ message: "Could not delete this promo." }, { status: 400 });
  return NextResponse.json({ message: "Promo deleted." });
}
