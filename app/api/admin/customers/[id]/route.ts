import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";
import {
  isMissingUserProfileColumnError,
  normalizeShippingAddress,
  type ShippingAddress,
} from "@/lib/userProfile";

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

  const baseProfileUpdate = {
    email,
    full_name: fullName,
    phone,
    shipping_address: shippingAddress,
  };

  let { error: profileError } = await serviceRoleClient
    .from("user_profiles")
    .update({
      ...baseProfileUpdate,
    })
    .eq("id", id);

  if (profileError && isMissingUserProfileColumnError(profileError)) {
    const fallbackResult = await serviceRoleClient
      .from("user_profiles")
      .update(baseProfileUpdate)
      .eq("id", id);
    profileError = fallbackResult.error;
  }

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

  const { error } = await serviceRoleClient.rpc("change_customer_account", {
    p_customer_id: id, p_action: "delete", p_actor_id: admin.user.id,
  });
  return NextResponse.json({ message: error?.message ?? "Customer deletion scheduled." }, { status: error ? 400 : 200 });
}
export async function POST(request: Request, context: RouteContext<"/api/admin/customers/[id]">) {
  const admin = await requireAdminRoute(request);
  if (admin.response) return admin.response;
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!["disable", "restore"].includes(payload?.action)) return NextResponse.json({ message: "Invalid account action." }, { status: 400 });
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Service credentials unavailable." }, { status: 500 });
  const { error } = await client.rpc("change_customer_account", { p_customer_id: id, p_action: payload.action, p_actor_id: admin.user.id });
  return NextResponse.json({ message: error?.message ?? (payload.action === "restore" ? "Customer restored." : "Customer disabled.") }, { status: error ? 400 : 200 });
}
