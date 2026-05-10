import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSlug } from "@/lib/content";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";

type CreateShippingTierPayload = {
  description?: string;
  eta?: string;
  fee?: number;
  isActive?: boolean;
  label?: string;
  sortOrder?: number;
};

async function buildUniqueShippingTierCode(
  serviceRoleClient: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>,
  label: string,
) {
  const baseCode = createSlug(label) || "shipping-tier";
  const { data, error } = await serviceRoleClient
    .from("shipping_tiers")
    .select("code")
    .ilike("code", `${baseCode}%`);

  if (error) {
    throw error;
  }

  const existingCodes = new Set(
    (data ?? [])
      .map((row) => row.code?.trim().toLowerCase())
      .filter((code): code is string => Boolean(code)),
  );

  if (!existingCodes.has(baseCode)) {
    return baseCode;
  }

  let suffix = 2;
  while (existingCodes.has(`${baseCode}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseCode}-${suffix}`;
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

  const payload = (await request.json().catch(() => null)) as CreateShippingTierPayload | null;
  const label = payload?.label?.trim() ?? "";

  if (!label) {
    return NextResponse.json(
      { message: "Enter a customer-facing shipping tier label." },
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

  let code = "shipping-tier";
  try {
    code = await buildUniqueShippingTierCode(serviceRoleClient, label);
  } catch (error) {
    console.error("Failed to generate shipping tier code.", error);
    return NextResponse.json(
      { message: "Could not prepare the shipping tier right now." },
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
      is_active: payload?.isActive ?? true,
    })
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
    console.error("Failed to create shipping tier.", error);
    return NextResponse.json(
      { message: "Could not create the shipping tier." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    tier,
    message: "Shipping tier created successfully.",
  });
}
