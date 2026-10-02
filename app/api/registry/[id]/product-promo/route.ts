import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireRouteUser } from "@/lib/authServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRouteUser(request);
  if (actor.response) return actor.response;
  const { id } = await params;
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Promo codes are unavailable." }, { status: 503 });
  const access = await client.rpc("get_registry_cash_balance", { p_registry_id: id, p_actor_id: actor.user.id });
  if (access.error) return NextResponse.json({ message: "Registry not available." }, { status: 403 });
  const { data, error } = await client.from("registries").select("product_promo_code,product_promo_subtotal,product_promo_discount").eq("id", id).single();
  const locked = await client.rpc("registry_promo_is_locked", { p_registry_id: id });
  if (error || locked.error) return NextResponse.json({ message: "Could not load the registry promo." }, { status: 400 });
  return NextResponse.json({ promo: { code: data.product_promo_code, subtotal: Number(data.product_promo_subtotal), discount: Number(data.product_promo_discount), locked: locked.data } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRouteUser(request);
  if (actor.response) return actor.response;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (typeof body?.code !== "string" || body.code.length > 204) return NextResponse.json({ message: "Enter a valid promo code." }, { status: 400 });
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Promo codes are unavailable." }, { status: 503 });
  const { data, error } = await client.rpc("set_registry_product_promo", { p_registry_id: id, p_actor_id: actor.user.id, p_code: body.code });
  if (error) return NextResponse.json({ message: error.code === "P0001" ? error.message : "Could not apply the registry promo." }, { status: 400 });
  revalidateTag("registries", "max");
  return NextResponse.json({ promo: data });
}
