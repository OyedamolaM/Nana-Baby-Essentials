import { NextResponse } from "next/server";
import { requireRouteUser } from "@/lib/authServer";
import { queueRecoveredPaymentEmails } from "@/lib/paymentEmails";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";

// Older clients request the same durable notification as the webhook.
export async function POST(request: Request) {
  const actor = await requireRouteUser(request);
  if (actor.response) return actor.response;
  const body: unknown = await request.json().catch(() => null);
  const orderId = body && typeof body === "object" && "orderId" in body && typeof body.orderId === "string" ? body.orderId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    return NextResponse.json({ message: "Enter a valid order id." }, { status: 400 });
  }
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Confirmation email is temporarily unavailable." }, { status: 503 });
  const result = await client.from("orders").select("id,status,payment_reference").eq("id", orderId).eq("user_id", actor.user.id).maybeSingle();
  if (result.error) return NextResponse.json({ message: "Could not load this order." }, { status: 500 });
  if (!result.data) return NextResponse.json({ message: "Order not found." }, { status: 404 });
  if (result.data.status !== "paid") return NextResponse.json({ message: "This order is not paid yet." }, { status: 400 });
  try {
    await queueRecoveredPaymentEmails(result.data.payment_reference ?? `order:${orderId}`);
    return NextResponse.json({ message: "Order confirmation email queued." });
  } catch (error) {
    console.error("Could not queue order confirmation.", error);
    return NextResponse.json({ message: "Your payment is recorded, but confirmation email could not be queued. Please try again." }, { status: 503 });
  }
}
