import { NextResponse } from "next/server";

import { requireRouteUser } from "@/lib/authServer";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type CancelOrderPayload = {
  orderId?: string;
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
    | CancelOrderPayload
    | null;
  const orderId = payload?.orderId?.trim() ?? "";

  if (!orderId) {
    return NextResponse.json(
      { message: "Order id is required." },
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
    .select("id, user_id, status")
    .eq("id", orderId)
    .maybeSingle<{
      id: string;
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

  if (!["pending", "awaiting_payment"].includes(order.status ?? "")) {
    return NextResponse.json({
      orderId: order.id,
      status: order.status ?? "unknown",
    });
  }

  const { error: updateError } = await serviceRoleClient
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", order.id);

  if (updateError) {
    return NextResponse.json(
      { message: updateError.message || "Could not cancel this order." },
      { status: 500 },
    );
  }

  return NextResponse.json({ orderId: order.id, status: "cancelled" });
}
