import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient, hasSupabaseServiceRoleEnv } from "@/lib/supabaseServer";
import {
  isMissingUserProfileColumnError,
  normalizeShippingAddress,
  type ShippingAddress,
} from "@/lib/userProfile";

type CreateCustomerPayload = {
  email?: string;
  fullName?: string;
  phone?: string;
  shippingAddress?: unknown;
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

  const payload = (await request.json().catch(() => null)) as CreateCustomerPayload | null;
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

  const { data: invitedUser, error: inviteError } =
    await serviceRoleClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        phone,
      },
      redirectTo: `${new URL(request.url).origin}/complete-profile`,
    });

  if (inviteError || !invitedUser.user) {
    return NextResponse.json(
      { message: inviteError?.message || "Could not create the customer account." },
      { status: 400 },
    );
  }

  const baseProfile = {
    id: invitedUser.user.id,
    email,
    full_name: fullName,
    phone,
    shipping_address: shippingAddress,
  };

  let { error: profileError } = await serviceRoleClient.from("user_profiles").upsert(
    {
      ...baseProfile,
      account_status: "active",
      deleted_at: null,
    },
    { onConflict: "id" },
  );

  if (profileError && isMissingUserProfileColumnError(profileError)) {
    const fallbackResult = await serviceRoleClient
      .from("user_profiles")
      .upsert(baseProfile, { onConflict: "id" });
    profileError = fallbackResult.error;
  }

  if (profileError) {
    return NextResponse.json(
      { message: profileError.message || "The customer account was created, but the profile could not be saved." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    customer: {
      id: invitedUser.user.id,
      email,
      fullName,
      phone,
      shippingAddress,
    },
    message: "Customer account created and invite email sent.",
  });
}
