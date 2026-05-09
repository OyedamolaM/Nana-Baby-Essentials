import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";
import { normalizeShippingAddress, type ShippingAddress } from "@/lib/userProfile";

type OrderItemInput = {
  name?: string;
  price?: number;
  productId?: number;
  quantity?: number;
};

type CreateAdminOrderPayload = {
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  items?: unknown;
  paymentReference?: string;
  shippingAddress?: unknown;
  shippingTier?: string;
  status?: string;
  total?: number;
  userId?: string | null;
};

function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ name: string; price: number; product_id?: number; quantity: number }>;
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

export async function POST(request: Request) {
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

  const payload = (await request.json().catch(() => null)) as CreateAdminOrderPayload | null;
  const customerName = payload?.customerName?.trim() ?? "";
  const customerEmail = payload?.customerEmail?.trim().toLowerCase() ?? "";
  const customerPhone = payload?.customerPhone?.trim() ?? "";
  const shippingTier = payload?.shippingTier?.trim() ?? "";
  const shippingAddress = normalizeShippingAddress(
    payload?.shippingAddress as Partial<ShippingAddress> | null | undefined,
  );
  const items = normalizeItems(payload?.items);
  const status = payload?.status?.trim() || "paid";
  const total = Math.max(0, Math.round(Number(payload?.total ?? 0)));

  if (!customerName || !customerEmail || !customerPhone || !shippingTier || items.length === 0) {
    return NextResponse.json(
      { message: "Customer name, email, phone, shipping tier, and order items are required." },
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

  const normalizedTotal =
    total > 0
      ? total
      : items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const orderPayload = {
    user_id: payload?.userId?.trim() || null,
    total: normalizedTotal,
    status,
    shipping_address: shippingAddress,
    billing_address: shippingAddress,
    items,
    payment_reference: payload?.paymentReference?.trim() || null,
    shipping_tier: shippingTier,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
  };

  const { data: order, error } = await serviceRoleClient
    .from("orders")
    .insert(orderPayload)
    .select("*")
    .single();

  if (error || !order) {
    return NextResponse.json(
      { message: error?.message || "Could not create the order." },
      { status: 400 },
    );
  }

  if (payload?.userId?.trim()) {
    await serviceRoleClient
      .from("user_profiles")
      .update({
        shipping_address: shippingAddress,
      })
      .eq("id", payload.userId.trim());
  }

  revalidateTag("orders", "max");
  return NextResponse.json({
    order,
    message: "Order created successfully.",
  });
}
