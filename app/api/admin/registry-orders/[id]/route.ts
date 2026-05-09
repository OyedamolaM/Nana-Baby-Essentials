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

type UpdateRegistryOrderPayload = {
  buyerEmail?: string;
  buyerMessage?: string | null;
  buyerName?: string;
  buyerPhone?: string;
  items?: unknown;
  shippingAddress?: unknown;
  status?: string;
  totalAmount?: number;
};

function normalizeRegistryOrderItems(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
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

export async function PATCH(request: Request, context: RouteContext<"/api/admin/registry-orders/[id]">) {
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
  const payload = (await request.json().catch(() => null)) as UpdateRegistryOrderPayload | null;
  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { data: existingOrderItems } = await serviceRoleClient
    .from("registry_order_items")
    .select("registry_item_id")
    .eq("registry_order_id", id);

  const updatePayload: Record<string, unknown> = {};
  if (payload?.buyerName?.trim()) {
    updatePayload.buyer_name = payload.buyerName.trim();
  }
  if (payload?.buyerEmail?.trim()) {
    updatePayload.buyer_email = payload.buyerEmail.trim().toLowerCase();
  }
  if (payload?.buyerPhone?.trim()) {
    updatePayload.buyer_phone = payload.buyerPhone.trim();
  }
  if (payload?.buyerMessage !== undefined) {
    updatePayload.buyer_message = payload.buyerMessage?.trim() || null;
  }
  if (payload?.totalAmount !== undefined) {
    updatePayload.total_amount = Math.max(0, Math.round(Number(payload.totalAmount)));
  }
  if (payload?.status?.trim()) {
    const nextStatus = payload.status.trim();
    updatePayload.status = nextStatus;
    updatePayload.paid_at = nextStatus === "paid" ? new Date().toISOString() : null;
  }
  if (payload?.shippingAddress !== undefined) {
    updatePayload.shipping_address = normalizeShippingAddress(
      payload.shippingAddress as Partial<ShippingAddress> | null | undefined,
    );
  }

  const { data: order, error } = await serviceRoleClient
    .from("registry_orders")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !order) {
    return NextResponse.json(
      { message: error?.message || "Could not update the registry order." },
      { status: 400 },
    );
  }

  const normalizedItems = normalizeRegistryOrderItems(payload?.items);
  const previousRegistryItemIds =
    ((existingOrderItems as Array<{ registry_item_id?: string | null }> | null) ?? [])
      .map((item) => item.registry_item_id)
      .filter((value): value is string => Boolean(value));

  if (normalizedItems) {
    await serviceRoleClient.from("registry_order_items").delete().eq("registry_order_id", id);

    if (normalizedItems.length > 0) {
      const { error: orderItemsError } = await serviceRoleClient
        .from("registry_order_items")
        .insert(
          normalizedItems.map((item) => ({
            registry_order_id: id,
            registry_item_id: item.registry_item_id,
            product_id: item.product_id,
            quantity: item.quantity,
            amount: item.amount,
          })),
        );

      if (orderItemsError) {
        return NextResponse.json(
          { message: orderItemsError.message || "Could not update the registry order items." },
          { status: 400 },
        );
      }
    }

    await rebuildRegistryItems(
      serviceRoleClient,
      previousRegistryItemIds.concat(
        normalizedItems
          .map((item) => item.registry_item_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
  } else {
    await rebuildRegistryItems(serviceRoleClient, previousRegistryItemIds);
  }

  revalidateTag("registries", "max");
  return NextResponse.json({
    order,
    message: "Registry order updated successfully.",
  });
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/registry-orders/[id]">) {
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

  const { data: existingOrderItems } = await serviceRoleClient
    .from("registry_order_items")
    .select("registry_item_id")
    .eq("registry_order_id", id);

  const registryItemIds =
    ((existingOrderItems as Array<{ registry_item_id?: string | null }> | null) ?? [])
      .map((item) => item.registry_item_id)
      .filter((value): value is string => Boolean(value));

  const { error } = await serviceRoleClient.from("registry_orders").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { message: error.message || "Could not delete the registry order." },
      { status: 400 },
    );
  }

  await rebuildRegistryItems(serviceRoleClient, registryItemIds);
  revalidateTag("registries", "max");
  return NextResponse.json({
    message: "Registry order deleted successfully.",
  });
}
