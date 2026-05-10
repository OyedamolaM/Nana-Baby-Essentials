import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";

type UpdateShippingTierPayload = {
  description?: string | null;
  eta?: string | null;
  fee?: number;
  fulfillmentType?: "delivery" | "pickup";
  isActive?: boolean;
  label?: string;
  sortOrder?: number;
};

export async function PATCH(request: Request, context: RouteContext<"/api/admin/shipping-tiers/[id]">) {
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
  const payload = (await request.json().catch(() => null)) as UpdateShippingTierPayload | null;
  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const updatePayload: Record<string, unknown> = {};
  if (payload?.label !== undefined) {
    const nextLabel = payload.label.trim();
    if (!nextLabel) {
      return NextResponse.json(
        { message: "Enter a customer-facing shipping tier label." },
        { status: 400 },
      );
    }

    updatePayload.label = nextLabel;
  }
  if (payload?.fee !== undefined) {
    updatePayload.fee = Math.max(0, Math.round(Number(payload.fee)));
  }
  if (payload?.eta !== undefined) {
    updatePayload.eta = payload.eta?.trim() || null;
  }
  if (payload?.description !== undefined) {
    updatePayload.description = payload.description?.trim() || null;
  }
  if (payload?.fulfillmentType !== undefined) {
    updatePayload.fulfillment_type = payload.fulfillmentType === "pickup" ? "pickup" : "delivery";
  }
  if (payload?.sortOrder !== undefined) {
    updatePayload.sort_order = Math.max(0, Math.round(Number(payload.sortOrder)));
  }
  if (payload?.isActive !== undefined) {
    updatePayload.is_active = payload.isActive;
  }

  const { data: tier, error } = await serviceRoleClient
    .from("shipping_tiers")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();

  if (error?.code === "23505") {
    return NextResponse.json(
      {
        message:
          "A shipping tier like this already exists. Try changing the customer label slightly.",
      },
      { status: 400 },
    );
  }

  if (error || !tier) {
    console.error("Failed to update shipping tier.", error);
    return NextResponse.json(
      { message: "Could not update the shipping tier." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    tier,
    message: "Shipping tier updated successfully.",
  });
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/shipping-tiers/[id]">) {
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

  const { error } = await serviceRoleClient.from("shipping_tiers").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { message: error.message || "Could not delete the shipping tier." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: "Shipping tier deleted successfully.",
  });
}
