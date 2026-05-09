import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";

type CreateShippingTierPayload = {
  code?: string;
  description?: string;
  eta?: string;
  fee?: number;
  label?: string;
  sortOrder?: number;
};

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

  const payload = (await request.json().catch(() => null)) as CreateShippingTierPayload | null;
  const code = payload?.code?.trim().toLowerCase() ?? "";
  const label = payload?.label?.trim() ?? "";

  if (!code || !label) {
    return NextResponse.json(
      { message: "Shipping tier code and label are required." },
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

  const { data: tier, error } = await serviceRoleClient
    .from("shipping_tiers")
    .insert({
      code,
      label,
      fee: Math.max(0, Math.round(Number(payload?.fee ?? 0))),
      eta: payload?.eta?.trim() || null,
      description: payload?.description?.trim() || null,
      sort_order: Math.max(0, Math.round(Number(payload?.sortOrder ?? 0))),
    })
    .select("*")
    .single();

  if (error || !tier) {
    return NextResponse.json(
      { message: error?.message || "Could not create the shipping tier." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    tier,
    message: "Shipping tier created successfully.",
  });
}
