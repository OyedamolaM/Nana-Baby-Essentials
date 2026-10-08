import { NextResponse } from "next/server";
import { isSecretAuthorized } from "@/lib/serverSecrets";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSecretAuthorized(request, process.env.BREVO_WEBHOOK_SECRET)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }
  const payload: unknown = await request.json().catch(() => null);
  const events = Array.isArray(payload) ? payload : [payload];
  if (!payload || events.length > 100 || events.some(event => !event || typeof event !== "object" || Array.isArray(event))) {
    return NextResponse.json({ message: "Invalid email event." }, { status: 400 });
  }
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Email event tracking unavailable." }, { status: 503 });
  for (const event of events as Record<string, unknown>[]) {
    if (typeof event.event !== "string" || !["delivered", "hard_bounce", "soft_bounce", "blocked", "invalid_email", "error", "spam", "deferred"].includes(event.event)) continue;
    const tags = Array.isArray(event.tags) ? event.tags : [];
    const tag = tags.find((value): value is string => typeof value === "string" && /^payment-email-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
    const id = tag?.slice("payment-email-".length) ?? null;
    const messageId = typeof event["message-id"] === "string" ? event["message-id"] : null;
    const recipient = typeof event.email === "string" ? event.email.trim() : "";
    const timestamp = event.ts_event ?? event.ts;
    if ((!id && !messageId) || !recipient || typeof timestamp !== "number" || !Number.isFinite(timestamp)) continue;
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) continue;
    const result = await client.rpc("record_payment_email_event", {
      p_id: id, p_message_id: messageId, p_recipient: recipient, p_event: event.event, p_event_at: date.toISOString(),
    });
    if (result.error) {
      console.error("Could not record email delivery event.", result.error);
      return NextResponse.json({ message: "Could not record email delivery event." }, { status: 503 });
    }
  }
  return NextResponse.json({ received: true });
}
