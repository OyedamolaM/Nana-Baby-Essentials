import "server-only";

import {
  createBrevoIdempotencyKey,
  getBrevoOrderSupportRecipient,
  hasBrevoEnv,
  hasBrevoOrderSupportRecipient,
  sendBrevoEmail,
} from "@/lib/brevo";
import { formatNairaAmount } from "@/lib/commerce";

type OrderSupportNotification = {
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  id: string;
  items?: unknown;
  paymentReference?: string | null;
  shippingAddress?: unknown;
  shippingTier?: string | null;
  total: number | string;
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function notifyOrderSupport(order: OrderSupportNotification) {
  if (!hasBrevoEnv || !hasBrevoOrderSupportRecipient) return false;

  const address = order.shippingAddress && typeof order.shippingAddress === "object"
    ? order.shippingAddress as Record<string, unknown>
    : {};
  const items = Array.isArray(order.items) ? order.items : [];
  const itemSummary = items.map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return `${String(value.name ?? "Store item")} x ${Math.max(1, Number(value.quantity ?? 1))}`;
  }).join(", ") || "No item details";
  const total = formatNairaAmount(Number(order.total));
  const details = [
    ["Customer", order.customerName || "Customer"],
    ["Email", order.customerEmail || "Not provided"],
    ["Phone", order.customerPhone || "Not provided"],
    ["Total", total],
    ["Delivery zone", order.shippingTier || "Not specified"],
    ["Address", [address.address, address.city, address.state].filter((value) => typeof value === "string" && value.trim()).join(", ") || "Not provided"],
    ["Items", itemSummary],
    ["Paystack reference", order.paymentReference || "Not provided"],
  ];
  const text = [`New paid order: ${order.id}`, "", ...details.map(([label, value]) => `${label}: ${value}`)].join("\n");

  await sendBrevoEmail({
    htmlContent: `<h2>New paid order</h2><p><strong>Order ID:</strong> ${escapeHtml(order.id)}</p><ul>${details.map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</li>`).join("")}</ul>`,
    idempotencyKey: createBrevoIdempotencyKey(`order-support:${order.id}:${order.paymentReference ?? "paid"}`),
    senderProfile: "order",
    subject: `New paid order ${order.id.slice(0, 8)} — ${total}`,
    tags: ["order-support-notification"],
    textContent: text,
    to: [{ email: getBrevoOrderSupportRecipient(), name: "Order Support" }],
  });

  return true;
}
