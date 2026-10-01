import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";

// Guest preview only. The registry checkout RPC validates the actual amount
// again and snapshots the discount before payment is started.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.code !== "string" || typeof body?.subtotal !== "number" || !Number.isFinite(body.subtotal) || body.subtotal <= 0) {
    return NextResponse.json({ message: "Enter a promo code and a valid product gift amount." }, { status: 400 });
  }
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Promo codes are temporarily unavailable." }, { status: 503 });
  const { data, error } = await client.rpc("get_checkout_promo_discount", {
    p_code: body.code.trim().toUpperCase(), p_subtotal: body.subtotal, p_shipping_fee: 0, p_context: "registry",
  });
  if (error) return NextResponse.json({ message: error.code === "P0001" ? error.message : "Could not apply this promo code." }, { status: 400 });
  return NextResponse.json({ promo: data });
}
