import { NextResponse } from "next/server";

import {
  getPaystackMetadataValue,
  hasPaystackServerEnv,
  isPaystackWebhookSignatureValid,
  matchesPaystackOrderAmount,
  verifyPaystackTransaction,
} from "@/lib/paystackServer";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type PaystackWebhookEvent = { event?: string; data?: { reference?: string } };

export async function POST(request: Request) {
  const body = await request.text();
  if (!isPaystackWebhookSignatureValid(body, request.headers.get("x-paystack-signature"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(body) as PaystackWebhookEvent;
  if (event.event !== "charge.success") return NextResponse.json({ received: true });
  const reference = event.data?.reference?.trim();
  if (!reference || !hasPaystackServerEnv || !hasSupabaseServiceRoleEnv) return NextResponse.json({ received: true });

  const payment = await verifyPaystackTransaction(reference);
  const orderId = getPaystackMetadataValue(payment.metadata, "order_id");
  if (payment.reference !== reference || payment.status !== "success" || payment.currency !== "NGN" || !orderId) return NextResponse.json({ received: true });

  const client = createSupabaseServiceRoleClient();
  if (!client) return new NextResponse("Server configuration error", { status: 500 });
  const { data: order, error } = await client.from("orders").select("id, total, status, payment_reference").eq("id", orderId).maybeSingle();
  if (error) return new NextResponse("Order lookup failed", { status: 500 });
  if (!order || (order.status === "paid" && order.payment_reference !== reference) || !["pending", "awaiting_payment", "paid"].includes(order.status ?? "") || !matchesPaystackOrderAmount(payment, order.total)) return NextResponse.json({ received: true });

  const { error: completionError } = await client.rpc("complete_store_order_payment", { p_order_id: order.id, p_paystack_reference: reference });
  if (completionError) return new NextResponse("Payment completion failed", { status: 500 });
  return NextResponse.json({ received: true });
}
