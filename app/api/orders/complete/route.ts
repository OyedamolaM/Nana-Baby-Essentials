import { NextResponse } from "next/server";

import { requireRouteUser } from "@/lib/authServer";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type CompleteOrderPayload = {
  orderId?: string;
  paystackReference?: string;
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
    .select("id, user_id, status, payment_reference")
    .eq("id", orderId)
    .maybeSingle<{
      id: string;
      payment_reference?: string | null;
      status?: string | null;
      user_id: string;
    }>();

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
    if (
      order.payment_reference &&
      order.payment_reference !== paystackReference
    ) {
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

  if (!["pending", "awaiting_payment"].includes(order.status ?? "")) {
    return NextResponse.json(
      { message: "Order can no longer be completed." },
      { status: 400 },
    );
  }

  const { error: updateError } = await serviceRoleClient
    .from("orders")
    .update({
      payment_method: "paystack",
      payment_reference: paystackReference,
      status: "paid",
    })
    .eq("id", order.id);

  if (updateError) {
    return NextResponse.json(
      { message: updateError.message || "Could not finalize this order." },
      { status: 500 },
    );
  }

  return NextResponse.json({ orderId: order.id, status: "paid" });
}
