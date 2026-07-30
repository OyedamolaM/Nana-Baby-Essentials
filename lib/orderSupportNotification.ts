import "server-only";

import {
  createBrevoIdempotencyKey,
  getBrevoOrderSupportRecipient,
  hasBrevoEnv,
  hasBrevoOrderSupportRecipient,
  sendBrevoEmail,
} from "@/lib/brevo";
import { renderOrderSupportEmail } from "@/lib/emailTemplates";
import { createOrderReceiptAttachment } from "@/lib/orderReceipt";

type OrderSupportNotification = {
  createdAt?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  id: string;
  items?: unknown;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  pickupCode?: string | null;
  shippingAddress?: unknown;
  shippingTier?: string | null;
  status?: string | null;
  total: number | string;
};

type StoreOrderItem = {
  name?: string;
  price?: number;
  quantity?: number;
};

type StoreOrderAddress = {
  address?: string;
  city?: string;
  name?: string;
  phone?: string;
  state?: string;
};

function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) return [] as StoreOrderItem[];

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : undefined,
      price: Math.max(0, Number(item.price ?? 0)),
      quantity: Math.max(1, Number(item.quantity ?? 1)),
    }));
}

function normalizeAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const address = value as Record<string, unknown>;
  return {
    address: typeof address.address === "string" ? address.address : undefined,
    city: typeof address.city === "string" ? address.city : undefined,
    name: typeof address.name === "string" ? address.name : undefined,
    phone: typeof address.phone === "string" ? address.phone : undefined,
    state: typeof address.state === "string" ? address.state : undefined,
  } satisfies StoreOrderAddress;
}

export async function notifyOrderSupport(order: OrderSupportNotification) {
  if (!hasBrevoEnv || !hasBrevoOrderSupportRecipient) return false;

  const items = normalizeItems(order.items);
  const shippingAddress = normalizeAddress(order.shippingAddress);
  const total = Number(order.total ?? 0);
  const customerEmail = order.customerEmail?.trim() || "Not provided";
  const email = renderOrderSupportEmail({
    createdAt: order.createdAt ?? null,
    customerEmail,
    customerName: order.customerName ?? null,
    customerPhone: order.customerPhone ?? null,
    items,
    orderId: order.id,
    paymentMethod: order.paymentMethod ?? null,
    paymentReference: order.paymentReference ?? null,
    pickupCode: order.pickupCode ?? null,
    shippingAddress,
    shippingTier: order.shippingTier ?? null,
    status: order.status ?? "paid",
    totalAmount: total,
  });

  await sendBrevoEmail({
    attachments: [
      createOrderReceiptAttachment({
        createdAt: order.createdAt ?? null,
        customerEmail: order.customerEmail ?? null,
        customerName: order.customerName ?? null,
        customerPhone: order.customerPhone ?? null,
        id: order.id,
        items,
        paymentMethod: order.paymentMethod ?? null,
        paymentReference: order.paymentReference ?? null,
        pickupCode: order.pickupCode ?? null,
        shippingAddress,
        shippingTier: order.shippingTier ?? null,
        status: order.status ?? "paid",
        total,
      }),
    ],
    htmlContent: email.html,
    idempotencyKey: createBrevoIdempotencyKey(
      `order-support:${order.id}:${order.paymentReference ?? "paid"}`,
    ),
    senderProfile: "order",
    subject: email.subject,
    tags: ["order-support-notification"],
    textContent: email.text,
    to: [{ email: getBrevoOrderSupportRecipient(), name: "Order Support" }],
  });

  return true;
}
