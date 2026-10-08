import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";
import { hasPaystackServerEnv, verifyPaystackTransaction } from "@/lib/paystackServer";
import { completeVerifiedRegistryDeliveryGift } from "@/lib/registryDeliveryGifts";
import { getCheckoutEmailError, getCheckoutPhoneError, normalizeCheckoutPhone } from "@/lib/checkoutContact";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("registryId");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Choose a registry." }, { status: 400 });
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Delivery gifts are unavailable." }, { status: 503 });
  const { data, error } = await client.rpc("get_registry_delivery_funding", { p_registry_id: id });
  if (error) return NextResponse.json({ message: "Could not load delivery gifting." }, { status: 400 });
  return NextResponse.json({ funding: data });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const client = createSupabaseServiceRoleClient();
  if (!client || !hasPaystackServerEnv) return NextResponse.json({ message: "Delivery gifts are unavailable." }, { status: 503 });
  try {
    if (body?.action === "initiate") {
      const contactError = getCheckoutPhoneError(typeof body.buyerPhone === "string" ? body.buyerPhone : "") || getCheckoutEmailError(typeof body.buyerEmail === "string" ? body.buyerEmail : "");
      if (contactError) throw new Error(contactError);
      if (typeof body.registryId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.registryId) || typeof body.buyerName !== "string" || body.buyerName.length > 120 || typeof body.buyerEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.buyerEmail) || body.buyerEmail.length > 254 || typeof body.buyerPhone !== "string" || body.buyerPhone.length > 50 || typeof body.paymentAmount !== "number" || !Number.isFinite(body.paymentAmount)) throw new Error("Enter valid gift details.");
      const { data, error } = await client.rpc("create_registry_delivery_gift", { p_registry_id: body.registryId, p_name: body.buyerName, p_email: body.buyerEmail.trim(), p_phone: normalizeCheckoutPhone(body.buyerPhone), p_message: typeof body.buyerMessage === "string" ? body.buyerMessage.slice(0, 1000) : null, p_amount: body.paymentAmount, p_reference: `NBE-REG-DEL-GIFT-${crypto.randomUUID()}` });
      if (error) throw new Error(error.code === "P0001" ? error.message : "Could not start the delivery gift.");
      return NextResponse.json(data);
    }
    if (typeof body?.reference !== "string" || body.reference.length > 100 || !["verify", "cancel"].includes(body.action)) throw new Error("Choose a valid payment action.");
    const payment = await verifyPaystackTransaction(body.reference).catch(() => null);
    if (payment?.status === "success") {
      if (payment.reference !== body.reference) throw new Error("Payment reference does not match.");
      await completeVerifiedRegistryDeliveryGift(payment);
      revalidateTag("registries", "max");
      return NextResponse.json({ paid: true });
    }
    if (body.action === "verify") throw new Error("Delivery gift payment has not succeeded.");
    const { error } = await client.rpc("cancel_registry_delivery_gift", { p_reference: body.reference });
    if (error) throw new Error("Could not cancel the delivery gift.");
    return NextResponse.json({ cancelled: true });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Could not process delivery gifting." }, { status: 400 }); }
}
