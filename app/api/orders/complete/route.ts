import { NextResponse } from "next/server";

import { requireRouteUser } from "@/lib/authServer";
import {
  hasPaystackServerEnv,
  getPaystackMetadataValue,
  matchesPaystackOrderAmount,
  verifyPaystackTransaction,
} from "@/lib/paystackServer";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type CompleteOrderPayload = {
  orderId?: string;
  paystackReference?: string;
};

type StoreOrderRow = {
  id: string;
  payment_reference?: string | null;
  status?: string | null;
  total: number | string;
  user_id: string;
};

export async function POST(request: Request) {
  const routeUser = await requireRouteUser(request);
  if (routeUser.response) {
    return routeUser.response;
  }

  if (!hasSupabaseServiceRoleEnv) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | CompleteOrderPayload
    | null;
  const orderId = payload?.orderId?.trim() ?? "";
  const paystackReference = payload?.paystackReference?.trim() ?? "";

  if (!orderId || !paystackReference) {
    return NextResponse.json(
      { message: "Order id and Paystack reference are required." },
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

  const { data: order, error: orderError } = await serviceRoleClient
    .from("orders")
    .select("id, user_id, status, payment_reference, total")
    .eq("id", orderId)
    .maybeSingle<StoreOrderRow>();

  if (orderError) {
    return NextResponse.json(
      { message: orderError.message || "Could not load this order." },
      { status: 500 },
    );
  }

  if (!order || order.user_id !== routeUser.user.id) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  if (order.status === "paid") {
    if (order.payment_reference && order.payment_reference !== paystackReference) {
      return NextResponse.json(
        {
          message:
            "Order is already marked as paid with a different payment reference.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ orderId: order.id, status: "paid" });
  }

  if (!['pending', 'awaiting_payment'].includes(order.status ?? "")) {
    return NextResponse.json(
      { message: "Order can no longer be completed." },
      { status: 400 },
    );
  }

  if (!hasPaystackServerEnv) {
    return NextResponse.json(
      { message: "Add PAYSTACK_SECRET_KEY to verify Paystack payments." },
      { status: 500 },
    );
  }

  let verifiedPayment;
  try {
    verifiedPayment = await verifyPaystackTransaction(paystackReference);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Paystack verification failed.",
      },
      { status: 502 },
    );
  }

  if (verifiedPayment.reference !== paystackReference) {
    return NextResponse.json(
      { message: "Verified Paystack reference does not match this order." },
      { status: 400 },
    );
  }

  if (verifiedPayment.status !== "success" || verifiedPayment.currency !== "NGN") {
    return NextResponse.json(
      { message: "This Paystack transaction is not a successful NGN payment." },
      { status: 400 },
    );
  }

  if (getPaystackMetadataValue(verifiedPayment.metadata, "order_id") !== order.id) {
    return NextResponse.json(
      { message: "Verified payment metadata does not match this order." },
      { status: 400 },
    );
  }

  if (!matchesPaystackOrderAmount(verifiedPayment, order.total)) {
    return NextResponse.json(
      { message: "Verified Paystack amount does not match this order." },
      { status: 400 },
    );
  }

  const { error: completionError } = await serviceRoleClient.rpc(
    "complete_store_order_payment",
    {
      p_order_id: order.id,
      p_paystack_reference: paystackReference,
    },
  );

  if (completionError) {
    return NextResponse.json(
      {
        message:
          completionError.message ||
          "Could not finalize this order after payment verification.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ orderId: order.id, status: "paid" });
}
