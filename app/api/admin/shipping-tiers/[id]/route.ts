import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";

type UpdateShippingTierPayload = {
  code?: string;
  description?: string | null;
  eta?: string | null;
  fee?: number;
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
  if (payload?.code?.trim()) {
    updatePayload.code = payload.code.trim().toLowerCase();
  }
  if (payload?.label?.trim()) {
    updatePayload.label = payload.label.trim();
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

  if (error || !tier) {
    return NextResponse.json(
      { message: error?.message || "Could not update the shipping tier." },
      { status: 400 },
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
