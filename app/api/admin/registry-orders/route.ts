import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";
import { normalizeShippingAddress, type ShippingAddress } from "@/lib/userProfile";

type RegistryOrderItemInput = {
  amount?: number;
  productId?: number | null;
  quantity?: number;
  registryItemId?: string | null;
};

type CreateRegistryOrderPayload = {
  buyerEmail?: string;
  buyerMessage?: string;
  buyerName?: string;
  buyerPhone?: string;
  items?: unknown;
  registryId?: string;
  shippingAddress?: unknown;
  status?: string;
  totalAmount?: number;
};

function normalizeRegistryOrderItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{
      amount: number;
      product_id: number | null;
      quantity: number;
      registry_item_id: string | null;
    }>;
  }

  return value
    .filter((item): item is RegistryOrderItemInput => Boolean(item) && typeof item === "object")
    .map((item) => ({
      amount: Math.max(0, Math.round(Number(item.amount ?? 0))),
      product_id: Number.isFinite(Number(item.productId)) ? Number(item.productId) : null,
      quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1))),
      registry_item_id: item.registryItemId?.trim() || null,
    }))
    .filter((item) => item.amount > 0);
}

async function rebuildRegistryItems(serviceRoleClient: ReturnType<typeof createSupabaseServiceRoleClient>, registryItemIds: string[]) {
  if (!serviceRoleClient) {
    return;
  }

  for (const registryItemId of Array.from(new Set(registryItemIds.filter(Boolean)))) {
    await serviceRoleClient.rpc("rebuild_registry_item_funding", {
      p_registry_item_id: registryItemId,
    });
  }
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

  const payload = (await request.json().catch(() => null)) as CreateRegistryOrderPayload | null;
  const registryId = payload?.registryId?.trim() ?? "";
  const buyerName = payload?.buyerName?.trim() ?? "";
  const buyerEmail = payload?.buyerEmail?.trim().toLowerCase() ?? "";
  const buyerPhone = payload?.buyerPhone?.trim() ?? "";
  const status = payload?.status?.trim() || "paid";
  const shippingAddress = normalizeShippingAddress(
    payload?.shippingAddress as Partial<ShippingAddress> | null | undefined,
  );
  const items = normalizeRegistryOrderItems(payload?.items);
  const totalAmount = Math.max(
    0,
    Math.round(
      Number(payload?.totalAmount ?? items.reduce((sum, item) => sum + item.amount, 0)),
    ),
  );

  if (!registryId || !buyerName || !buyerEmail || !buyerPhone || items.length === 0) {
    return NextResponse.json(
      { message: "Registry, buyer details, and order items are required." },
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

  const contributionType = items.some((item) => item.registry_item_id) ? "items" : "cash";
  const { data: order, error } = await serviceRoleClient
    .from("registry_orders")
    .insert({
      registry_id: registryId,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      buyer_phone: buyerPhone,
      buyer_message: payload?.buyerMessage?.trim() || null,
      total_amount: totalAmount,
      contribution_type: contributionType,
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
      shipping_address: shippingAddress,
    })
    .select("*")
    .single();

  if (error || !order) {
    return NextResponse.json(
      { message: error?.message || "Could not create the registry order." },
      { status: 400 },
    );
  }

  const { error: orderItemsError } = await serviceRoleClient.from("registry_order_items").insert(
    items.map((item) => ({
      registry_order_id: order.id,
      registry_item_id: item.registry_item_id,
      product_id: item.product_id,
      quantity: item.quantity,
      amount: item.amount,
    })),
  );

  if (orderItemsError) {
    await serviceRoleClient.from("registry_orders").delete().eq("id", order.id);
    return NextResponse.json(
      { message: orderItemsError.message || "Could not save the registry order items." },
      { status: 400 },
    );
  }

  await rebuildRegistryItems(
    serviceRoleClient,
    items.map((item) => item.registry_item_id).filter((value): value is string => Boolean(value)),
  );

  revalidateTag("registries", "max");
  return NextResponse.json({
    order,
    message: "Registry order created successfully.",
  });
}
