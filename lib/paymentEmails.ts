import "server-only";

import { after } from "next/server";
import {
  BrevoEmailError, createBrevoIdempotencyKey, hasBrevoEnv, sendBrevoEmail,
  type BrevoSingleEmailPayload,
} from "./brevo";
import { renderOrderConfirmationEmail, renderRegistryPaymentEmail } from "./emailTemplates";
import { createOrderReceiptAttachment } from "./orderReceipt";
import { buildOrderSupportEmail, normalizeOrderEmailAddress, normalizeOrderEmailItems } from "./orderSupportNotification";
import { createSupabaseServiceRoleClient } from "./supabaseServer";

type EmailJob = {
  id: string;
  kind: string;
  source_id: string;
  payment_reference: string;
  recipient_email: string | null;
  lock_token: string;
  uncertain_since: string | null;
};
type EmailClient = NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>;

async function buildPaymentEmail(client: EmailClient, job: EmailJob): Promise<BrevoSingleEmailPayload> {
  if (job.kind === "store_customer" || job.kind === "store_support") {
    const result = await client.from("orders").select("*").eq("id", job.source_id).eq("status", "paid").maybeSingle();
    if (result.error) throw new Error(result.error.message);
    const order = result.data;
    if (!order || (order.payment_reference ?? `order:${order.id}`) !== job.payment_reference) {
      throw new Error("Paid order no longer matches this notification.");
    }
    const pickupCode = order.pickup_code ?? order.customer_pickup_code ?? order.rider_pickup_code ?? null;
    if (job.kind === "store_support") return buildOrderSupportEmail({
      createdAt: order.created_at, customerEmail: order.customer_email, customerName: order.customer_name,
      customerPhone: order.customer_phone, id: order.id, items: order.items,
      paymentMethod: order.payment_method, paymentReference: order.payment_reference,
      pickupCode, shippingAddress: order.shipping_address, shippingTier: order.shipping_label,
      promoCode: order.promo_code, discountAmount: order.discount_amount, status: order.status, total: order.total,
    });
    const recipient = job.recipient_email?.trim();
    if (!recipient) throw new Error("Order confirmation recipient is missing.");
    const items = normalizeOrderEmailItems(order.items);
    const shippingAddress = normalizeOrderEmailAddress(order.shipping_address);
    const email = renderOrderConfirmationEmail({
      createdAt: order.created_at, customerEmail: recipient, customerName: order.customer_name,
      items, orderId: order.id, paymentMethod: order.payment_method, paymentReference: order.payment_reference,
      pickupCode, shippingAddress, shippingTier: order.shipping_label, totalAmount: Number(order.total),
    });
    return {
      htmlContent: email.html, textContent: email.text, subject: email.subject, senderProfile: "order",
      tags: ["order-confirmation"], to: [{ email: recipient, name: order.customer_name || undefined }],
      attachments: [createOrderReceiptAttachment({
        createdAt: order.created_at, customerEmail: recipient, customerName: order.customer_name,
        customerPhone: order.customer_phone, customerPickupCode: order.customer_pickup_code,
        riderPickupCode: order.rider_pickup_code, id: order.id, items, paymentMethod: order.payment_method,
        paymentReference: order.payment_reference, pickupCode, shippingAddress, shippingTier: order.shipping_label,
        promoCode: order.promo_code, discountAmount: order.discount_amount, status: order.status, total: Number(order.total),
      })],
    };
  }

  const recipient = job.recipient_email?.trim();
  if (!recipient) throw new Error("Registry payment recipient is missing.");
  if (job.kind === "delivery_receipt") {
    const result = await client.from("registry_delivery_orders").select("*").eq("id", job.source_id)
      .eq("payment_reference", job.payment_reference).eq("status", "paid").maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("Paid delivery no longer exists.");
    const order = result.data;
    const address = normalizeOrderEmailAddress(order.shipping_address);
    const email = renderOrderConfirmationEmail({
      createdAt: order.created_at, customerEmail: recipient, customerName: address?.name,
      items: [{ name: "Registry delivery", price: Number(order.total), quantity: 1 }], orderId: order.id,
      paymentMethod: "paystack", paymentReference: job.payment_reference, shippingAddress: address,
      shippingTier: order.shipping_label, totalAmount: Number(order.total),
    });
    return { subject: "Your registry delivery payment is confirmed", htmlContent: email.html, textContent: email.text,
      senderProfile: "order", tags: ["registry-delivery-confirmation"], to: [{ email: recipient }] };
  }

  const registryResult = await client.from("registries").select("name").eq("id", job.source_id).maybeSingle();
  if (registryResult.error) throw new Error(registryResult.error.message);
  if (!registryResult.data) throw new Error("Registry no longer exists.");
  let amount = 0;
  let buyerName = "A guest";
  const delivery = job.kind.startsWith("delivery_");
  if (delivery) {
    const result = await client.from("registry_delivery_gifts").select("amount,buyer_name").eq("registry_id", job.source_id)
      .eq("payment_reference", job.payment_reference).eq("status", "paid").maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("Paid delivery gift no longer exists.");
    amount = Number(result.data.amount);
    buyerName = result.data.buyer_name;
  } else {
    const [order, contribution] = await Promise.all([
      client.from("registry_orders").select("total_amount,buyer_name").eq("registry_id", job.source_id)
        .eq("paystack_reference", job.payment_reference).eq("status", "paid").maybeSingle(),
      client.from("registry_contributions").select("amount,buyer_name").eq("registry_id", job.source_id)
        .eq("paystack_reference", job.payment_reference).eq("status", "paid").maybeSingle(),
    ]);
    if (order.error || contribution.error) throw new Error(order.error?.message ?? contribution.error?.message);
    amount = Number(order.data?.total_amount ?? 0) + Number(contribution.data?.amount ?? 0);
    buyerName = order.data?.buyer_name ?? contribution.data?.buyer_name ?? buyerName;
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Paid gift amount is missing.");
  const email = renderRegistryPaymentEmail({
    registryName: registryResult.data.name, buyerName, amount, reference: job.payment_reference,
    owner: job.kind.endsWith("_owner"), delivery,
  });
  return { subject: email.subject, htmlContent: email.html, textContent: email.text, senderProfile: "order",
    tags: ["registry-payment-confirmation"], to: [{ email: recipient }] };
}

export async function processPaymentEmails(reference?: string, limit = 10) {
  const client = createSupabaseServiceRoleClient();
  if (!client) throw new Error("Payment email queue is unavailable.");
  // Configuration failures leave jobs pending rather than consuming attempts.
  if (!hasBrevoEnv) return { processed: 0, accepted: 0, deferred: true };
  let processed = 0;
  let accepted = 0;
  const deadline = Date.now() + 40000;
  while (processed < limit && Date.now() < deadline) {
    const claimed = await client.rpc("claim_payment_email", { p_reference: reference ?? null });
    if (claimed.error) throw new Error(claimed.error.message);
    const job = claimed.data?.[0] as EmailJob | undefined;
    if (!job) break;
    let startedAt: string | null = null;
    let status = "pending";
    let messageIds: string[] = [];
    let errorMessage: string | null = null;
    let uncertainSince = job.uncertain_since;
    try {
      const payload = await buildPaymentEmail(client, job);
      // Keep the original store keys during rollout for callbacks still in flight.
      const key = job.kind === "store_customer"
        ? `order-confirmation:${job.source_id}:${job.payment_reference.startsWith("order:") ? "paid" : job.payment_reference}`
        : job.kind === "store_support"
          ? `order-support:${job.source_id}:${job.payment_reference.startsWith("order:") ? "paid" : job.payment_reference}`
          : `payment-email:${job.kind}:${job.payment_reference}`;
      const started = await client.rpc("start_payment_email_send", { p_id: job.id, p_token: job.lock_token, p_recipient: payload.to[0].email });
      if (started.error) throw new Error(started.error.message);
      startedAt = started.data as string;
      const result = await sendBrevoEmail({ ...payload, idempotencyKey: createBrevoIdempotencyKey(key),
        tags: [...(payload.tags ?? []), `payment-email-${job.id}`] });
      messageIds = result.messageIds;
      status = result.sandbox ? "sandbox" : "accepted";
      uncertainSince = null;
      accepted++;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Payment email failed.";
      if (startedAt && (!(error instanceof BrevoEmailError) || !error.definitive)) {
        uncertainSince ??= startedAt;
      }
      if (error instanceof BrevoEmailError && !error.retryable && !uncertainSince) status = "failed";
    }
    // If recording acceptance fails, leave the lease intact. A subsequent worker
    // retries the same provider key within its window, or flags it for review.
    const finished = await client.rpc("finish_payment_email", {
      p_id: job.id, p_token: job.lock_token, p_status: status, p_message_ids: messageIds,
      p_error: errorMessage, p_uncertain_since: uncertainSince,
    });
    if (finished.error) throw new Error(finished.error.message);
    processed++;
  }
  return { processed, accepted, deferred: false };
}

export function schedulePaymentEmails(reference: string) {
  after(async () => {
    try { await processPaymentEmails(reference, 4); }
    catch (error) { console.error("Payment emails remain queued for retry.", error); }
  });
}

export async function queueRecoveredPaymentEmails(reference: string) {
  const client = createSupabaseServiceRoleClient();
  if (!client) throw new Error("Payment email queue is unavailable.");
  const queued = await client.rpc("enqueue_payment_emails", { p_reference: reference });
  if (queued.error) throw new Error(queued.error.message);
  schedulePaymentEmails(reference);
}
