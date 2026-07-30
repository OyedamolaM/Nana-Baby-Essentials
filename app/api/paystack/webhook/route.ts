import { NextResponse } from "next/server";

import { notifyOrderSupport } from "@/lib/orderSupportNotification";
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
      "id, created_at, total, status, payment_method, payment_reference, items, shipping_address, shipping_tier, customer_name, customer_email, customer_phone, pickup_code, customer_pickup_code, rider_pickup_code",
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

  await notifyOrderSupport({
    createdAt: order.created_at,
    customerEmail: order.customer_email,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    id: order.id,
    items: order.items,
    paymentMethod: order.payment_method,
    paymentReference: reference,
    pickupCode:
      order.pickup_code ??
      order.customer_pickup_code ??
      order.rider_pickup_code ??
      null,
    shippingAddress: order.shipping_address,
    shippingTier: order.shipping_tier,
    status: "paid",
    total: order.total,
  }).catch((notificationError) => {
    console.error("Failed to notify order support.", notificationError);
  });

  return NextResponse.json({ received: true });
}
