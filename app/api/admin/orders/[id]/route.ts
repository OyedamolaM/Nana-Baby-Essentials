import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdminRoute } from "@/lib/authServer";
import { calculatePromoDiscount } from "@/lib/promos";
import { getOrderPaymentMethodValue } from "@/lib/orderPayments";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";
import { normalizeShippingAddress, type ShippingAddress } from "@/lib/userProfile";

type OrderItemInput = {
  name?: string;
  price?: number;
  productId?: number;
  quantity?: number;
};

type UpdateAdminOrderPayload = {
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  items?: unknown;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  shippingAddress?: unknown;
  shippingTier?: string;
  status?: string;
  total?: number;
};

function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .filter((item): item is OrderItemInput => Boolean(item) && typeof item === "object")
    .map((item) => ({
      name: item.name?.trim() || "Order item",
      price: Math.max(0, Math.round(Number(item.price ?? 0))),
      product_id: Number.isFinite(Number(item.productId)) ? Number(item.productId) : undefined,
      quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1))),
    }))
    .filter((item) => item.price > 0);
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/orders/[id]">) {
  const admin = await requireAdminRoute(request);
  if (admin.response) {
    return admin.response;
  }

  if (!hasSupabaseServiceRoleEnv) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as UpdateAdminOrderPayload | null;
  const serviceRoleClient = createSupabaseServiceRoleClient();

  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const updatePayload: Record<string, unknown> = {};
  if (payload?.customerName?.trim()) {
    updatePayload.customer_name = payload.customerName.trim();
  }
  if (payload?.customerEmail?.trim()) {
    updatePayload.customer_email = payload.customerEmail.trim().toLowerCase();
  }
  if (payload?.customerPhone?.trim()) {
    updatePayload.customer_phone = payload.customerPhone.trim();
  }
  if (payload?.status?.trim()) {
    updatePayload.status = payload.status.trim();
  }
  if (payload?.shippingTier?.trim()) {
    updatePayload.shipping_tier = payload.shippingTier.trim();
  }
  if (payload?.paymentReference !== undefined) {
    updatePayload.payment_reference = payload.paymentReference?.trim() || null;
  }
  if (payload?.paymentMethod !== undefined || payload?.paymentReference !== undefined) {
    updatePayload.payment_method = getOrderPaymentMethodValue(
      payload?.paymentMethod,
      payload?.paymentReference,
    );
  }
  if (payload?.shippingAddress !== undefined) {
    updatePayload.shipping_address = normalizeShippingAddress(
      payload.shippingAddress as Partial<ShippingAddress> | null | undefined,
    );
    updatePayload.billing_address = normalizeShippingAddress(
      payload.shippingAddress as Partial<ShippingAddress> | null | undefined,
    );
  }
  if (payload?.total !== undefined) {
    updatePayload.total = Math.max(0, Math.round(Number(payload.total)));
  }

  const normalizedItems = normalizeItems(payload?.items);
  if (normalizedItems) {
    updatePayload.items = normalizedItems;
  }

  const { data: existingOrder } = await serviceRoleClient.from("orders")
    .select("items,total,promo_code,discount_percentage,discount_amount,shipping_tier,promo_type,maximum_discount_amount,promo_details")
    .eq("id", id).maybeSingle();
  if (!existingOrder) return NextResponse.json({ message: "Order not found." }, { status: 404 });
  const shippingCode = payload?.shippingTier?.trim() || existingOrder.shipping_tier;
  const { data: tier } = await serviceRoleClient.from("shipping_tiers").select("label,fee").eq("code", shippingCode).maybeSingle();
  if (tier) updatePayload.shipping_label = tier.label;
  if (existingOrder.promo_code && (normalizedItems || payload?.total !== undefined || payload?.shippingTier !== undefined)) {
    const originalItems = (existingOrder.items ?? []) as { price?: number; quantity?: number }[];
    const originalSubtotal = originalItems.reduce((sum, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 0), 0);
    const subtotal = normalizedItems ? normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0) : originalSubtotal;
    const shippingFee = shippingCode !== existingOrder.shipping_tier && tier
      ? Number(tier.fee)
      : Math.max(0, Number(existingOrder.total) + Number(existingOrder.discount_amount ?? 0) - originalSubtotal);
    const discount = calculatePromoDiscount({ details: existingOrder.promo_details, promoType: existingOrder.promo_type ?? "products", percentage: Number(existingOrder.discount_percentage ?? 0), maximumDiscountAmount: existingOrder.maximum_discount_amount === null ? null : Number(existingOrder.maximum_discount_amount) }, subtotal, shippingFee);
    updatePayload.discount_amount = discount;
    updatePayload.shipping_discount_amount = existingOrder.promo_type && existingOrder.promo_type !== "products" ? discount : 0;
    updatePayload.total = Math.round((subtotal - discount + shippingFee) * 100) / 100;
  }

  const { data: order, error } = await serviceRoleClient
    .from("orders")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !order) {
    return NextResponse.json(
      { message: error?.message || "Could not update the order." },
      { status: 400 },
    );
  }

  revalidateTag("orders", "max");
  return NextResponse.json({
    order,
    message: "Order updated successfully.",
  });
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/orders/[id]">) {
  const admin = await requireAdminRoute(request);
  if (admin.response) {
    return admin.response;
  }

  if (!hasSupabaseServiceRoleEnv) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { id } = await context.params;
  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { error } = await serviceRoleClient.from("orders").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { message: error.message || "Could not delete the order." },
      { status: 400 },
    );
  }

  revalidateTag("orders", "max");
  return NextResponse.json({
    message: "Order deleted successfully.",
  });
}
