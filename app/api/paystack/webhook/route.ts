import { completeVerifiedRegistryDeliveryGift } from "@/lib/registryDeliveryGifts";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { schedulePaymentEmails } from "@/lib/paymentEmails";
import { completeVerifiedRegistryCheckout } from "@/lib/registryPayments";
import {
  getPaystackMetadataValue,
  hasPaystackServerEnv,
  isPaystackWebhookSignatureValid,
  matchesPaystackOrderAmount,
  verifyPaystackTransaction,
} from "@/lib/paystackServer";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

export const runtime = "nodejs";

type PaystackWebhookEvent = {
  data?: {
    reference?: string;
  };
  event?: string;
};

export async function POST(request: Request) {
  const body = await request.text();
  if (
    !isPaystackWebhookSignatureValid(
      body,
      request.headers.get("x-paystack-signature"),
    )
  ) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let event: PaystackWebhookEvent;
  try {
    event = JSON.parse(body) as PaystackWebhookEvent;
  } catch {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const reference = event.data?.reference?.trim() ?? "";
  if (!reference) {
    return new NextResponse("Missing transaction reference", { status: 400 });
  }

  if (!hasPaystackServerEnv || !hasSupabaseServiceRoleEnv) {
    return new NextResponse("Server configuration error", { status: 500 });
  }

  let payment;
  try {
    payment = await verifyPaystackTransaction(reference);
  } catch (error) {
    console.error("Webhook payment verification failed.", error);
    return new NextResponse("Payment verification failed", { status: 502 });
  }

  if (getPaystackMetadataValue(payment.metadata, "registry_delivery_gift_id")) {
    if (payment.reference !== reference) return new NextResponse("Payment reference mismatch", { status: 400 });
    try { await completeVerifiedRegistryDeliveryGift(payment); return NextResponse.json({ received: true }); }
    catch (error) { console.error("Delivery gift webhook failed.", error); return new NextResponse("Delivery gift verification failed", { status: 400 }); }
  }
  const deliveryId = getPaystackMetadataValue(payment.metadata, "registry_delivery_id");
  if (deliveryId) {
    if (payment.reference !== reference || payment.status !== "success" || payment.currency !== "NGN") return NextResponse.json({ received: true });
    const client = createSupabaseServiceRoleClient();
    if (!client) return new NextResponse("Server configuration error", { status: 500 });
    const { data: delivery, error } = await client.from("registry_delivery_orders").select("id,registry_id,total,payment_reference").eq("id", deliveryId).eq("payment_reference", reference).maybeSingle();
    if (error) return new NextResponse("Delivery lookup failed", { status: 500 });
    if (!delivery || !matchesPaystackOrderAmount(payment, delivery.total) || getPaystackMetadataValue(payment.metadata, "registry_id") !== delivery.registry_id) return NextResponse.json({ received: true });
    const completed = await client.rpc("complete_registry_delivery_payment", { p_reference: reference, p_paid_amount_kobo: Math.round(Number(delivery.total) * 100) });
    if (completed.error) return new NextResponse("Delivery confirmation failed", { status: 500 });
    schedulePaymentEmails(reference);
    return NextResponse.json({ received: true });
  }
  // Registry gifts do not belong to the store orders table. Confirm them even
  // when the customer's browser never calls the checkout verification endpoint.
  if (getPaystackMetadataValue(payment.metadata, "registry_id")) {
    if (payment.reference !== reference) {
      return new NextResponse("Payment reference mismatch", { status: 400 });
    }
    try {
      await completeVerifiedRegistryCheckout(payment);
      revalidateTag("registries", { expire: 0 });
      return NextResponse.json({ received: true });
    } catch (error) {
      console.error("Webhook registry payment completion failed.", error);
      // Do not acknowledge a payment that we failed to record; Paystack retries.
      return new NextResponse("Registry payment completion failed", { status: 500 });
    }
  }
  const orderId = getPaystackMetadataValue(payment.metadata, "order_id");
  if (
    payment.reference !== reference ||
    payment.status !== "success" ||
    payment.currency !== "NGN" ||
    !orderId
  ) {
    return NextResponse.json({ received: true });
  }

  const client = createSupabaseServiceRoleClient();
  if (!client) {
    return new NextResponse("Server configuration error", { status: 500 });
  }

  const { data: order, error } = await client
    .from("orders")
    .select(
      "id, created_at, total, status, payment_method, payment_reference, items, shipping_address, shipping_tier, shipping_label, promo_code, discount_amount, customer_name, customer_email, customer_phone, pickup_code, customer_pickup_code, rider_pickup_code",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("Webhook order lookup failed.", error);
    return new NextResponse("Order lookup failed", { status: 500 });
  }

  if (
    !order ||
    (order.status === "paid" && order.payment_reference !== reference) ||
    !["pending", "awaiting_payment", "paid"].includes(order.status ?? "") ||
    !matchesPaystackOrderAmount(payment, order.total)
  ) {
    return NextResponse.json({ received: true });
  }

  const { error: completionError } = await client.rpc(
    "complete_store_order_payment",
    {
      p_order_id: order.id,
      p_paystack_reference: reference,
    },
  );

  if (completionError) {
    console.error("Webhook payment completion failed.", completionError);
    return new NextResponse("Payment completion failed", { status: 500 });
  }
  schedulePaymentEmails(reference);

  return NextResponse.json({ received: true });
}
