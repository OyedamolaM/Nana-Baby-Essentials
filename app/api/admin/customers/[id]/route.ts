import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";
import { normalizeShippingAddress, type ShippingAddress } from "@/lib/userProfile";

type UpdateCustomerPayload = {
  email?: string;
  fullName?: string;
  phone?: string;
  shippingAddress?: unknown;
};

export async function PATCH(request: Request, context: RouteContext<"/api/admin/customers/[id]">) {
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
  const payload = (await request.json().catch(() => null)) as UpdateCustomerPayload | null;
  const email = payload?.email?.trim().toLowerCase() ?? "";
  const fullName = payload?.fullName?.trim() ?? "";
  const phone = payload?.phone?.trim() ?? "";
  const shippingAddress = normalizeShippingAddress(
    payload?.shippingAddress as Partial<ShippingAddress> | null | undefined,
  );

  if (!email || !fullName || !phone) {
    return NextResponse.json(
      { message: "Full name, email, and phone number are required." },
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

  const { error: authError } = await serviceRoleClient.auth.admin.updateUserById(id, {
    email,
    ban_duration: "none",
    user_metadata: {
      full_name: fullName,
      phone,
    },
  });

  if (authError) {
    return NextResponse.json(
      { message: authError.message || "Could not update the customer login details." },
      { status: 400 },
    );
  }

  const { error: profileError } = await serviceRoleClient
    .from("user_profiles")
    .update({
      email,
      full_name: fullName,
      phone,
      shipping_address: shippingAddress,
      account_status: "active",
      deleted_at: null,
    })
    .eq("id", id);

  if (profileError) {
    return NextResponse.json(
      { message: profileError.message || "Could not update the customer profile." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    customer: {
      id,
      email,
      fullName,
      phone,
      shippingAddress,
    },
    message: "Customer updated successfully.",
  });
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/customers/[id]">) {
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

  const { error: authError } = await serviceRoleClient.auth.admin.updateUserById(id, {
    ban_duration: "876000h",
  });

  if (authError) {
    return NextResponse.json(
      { message: authError.message || "Could not disable the customer login." },
      { status: 400 },
    );
  }

  const { error: profileError } = await serviceRoleClient
    .from("user_profiles")
    .update({
      account_status: "disabled",
      deleted_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (profileError) {
    return NextResponse.json(
      { message: profileError.message || "Could not soft-delete the customer profile." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: "Customer disabled successfully.",
  });
}
