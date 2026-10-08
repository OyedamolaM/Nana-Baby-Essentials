import { NextResponse } from "next/server";

import { requireRouteUser } from "@/lib/authServer";
import { getCheckoutEmailError, getCheckoutPhoneError, normalizeCheckoutPhone } from "@/lib/checkoutContact";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  const routeUser = await requireRouteUser(request);
  if (routeUser.response) return routeUser.response;

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || !isRecord(body.shippingAddress) || !isRecord(body.billingAddress) ||
      !Array.isArray(body.items) || !body.items.length || typeof body.shippingTier !== "string" ||
      (body.promoCode != null && typeof body.promoCode !== "string")) {
    return NextResponse.json({ message: "Enter valid checkout details." }, { status: 400 });
  }

  const phone = typeof body.shippingAddress.phone === "string" ? body.shippingAddress.phone : "";
  const contactError = getCheckoutPhoneError(phone) || getCheckoutEmailError(routeUser.profile?.email ?? "");
  if (contactError) return NextResponse.json({ message: contactError }, { status: 400 });

  const normalizedPhone = normalizeCheckoutPhone(phone);
  const client = createSupabaseServerClient(routeUser.accessToken);
  if (!client) return NextResponse.json({ message: "Checkout is temporarily unavailable." }, { status: 503 });

  // Keep the customer's identity and pricing under the existing database RPC.
  const { data, error } = await client.rpc("create_store_order", {
    p_shipping_address: { ...body.shippingAddress, phone: normalizedPhone },
    p_billing_address: { ...body.billingAddress, phone: normalizedPhone },
    p_items: body.items,
    p_shipping_tier: body.shippingTier,
    p_promo_code: body.promoCode ?? null,
  });
  if (error || typeof data !== "string") {
    return NextResponse.json({ message: error?.message || "Failed to start checkout." }, { status: 400 });
  }
  return NextResponse.json({ orderId: data });
}
