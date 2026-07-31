import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import {
  createSupabaseServiceRoleClient,
  createSupabaseServerClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";
import {
  loadServerUserProfile,
  requireRouteUser,
} from "@/lib/authServer";
import {
  hasSavedShippingAddress,
  isMissingUserProfileColumnError,
  normalizeShippingAddress,
  type ShippingAddress,
} from "@/lib/userProfile";

type SyncProfilePayload = {
  email?: string;
  fullName?: string;
  phone?: string;
};

type UpdateProfilePayload = {
  campaign_opt_out?: unknown;
  full_name?: unknown;
  phone?: unknown;
  shipping_address?: unknown;
};

function getProfileMutationClient(accessToken: string) {
  if (hasSupabaseServiceRoleEnv) {
    return createSupabaseServiceRoleClient();
  }

  return createSupabaseServerClient(accessToken);
}

export async function GET(request: Request) {
  const routeUser = await requireRouteUser(request);
  if (routeUser.response) {
    return routeUser.response;
  }

  return NextResponse.json({
    profile: routeUser.profile,
  });
}

export async function POST(request: Request) {
  const routeUser = await requireRouteUser(request);
  if (routeUser.response) {
    return routeUser.response;
  }

  const payload = (await request.json().catch(() => null)) as SyncProfilePayload | null;
  const mutationClient = getProfileMutationClient(routeUser.accessToken);

  if (!mutationClient) {
    return NextResponse.json(
      { message: "Supabase server credentials are not configured." },
      { status: 500 },
    );
  }

  const metadataFullName =
    typeof routeUser.user.user_metadata?.full_name === "string"
      ? routeUser.user.user_metadata.full_name.trim()
      : typeof routeUser.user.user_metadata?.name === "string"
        ? routeUser.user.user_metadata.name.trim()
        : "";
  const metadataPhone =
    typeof routeUser.user.user_metadata?.phone === "string"
      ? routeUser.user.user_metadata.phone.trim()
      : "";
  const email =
    payload?.email?.trim().toLowerCase() ||
    routeUser.user.email?.trim().toLowerCase() ||
    "";
  const fullName = payload?.fullName?.trim() || metadataFullName;
  const phone = payload?.phone?.trim() || metadataPhone;

  const baseProfile: {
    email: string;
    full_name?: string | null;
    id: string;
    phone?: string;
  } = {
    email,
    id: routeUser.user.id,
  };

  if (fullName) {
    baseProfile.full_name = fullName;
  }

  if (phone) {
    baseProfile.phone = phone;
  }

  let { error } = await mutationClient.from("user_profiles").upsert(
    {
      ...baseProfile,
      account_status: "active",
      deleted_at: null,
    },
    { onConflict: "id" },
  );

  if (error && isMissingUserProfileColumnError(error)) {
    const fallbackResult = await mutationClient
      .from("user_profiles")
      .upsert(baseProfile, { onConflict: "id" });
    error = fallbackResult.error;
  }

  if (error) {
    return NextResponse.json(
      { message: error.message || "Could not sync your profile." },
      { status: 500 },
    );
  }

  const profile = await loadServerUserProfile(
    routeUser.user.id,
    routeUser.accessToken,
  );

  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  const routeUser = await requireRouteUser(request);
  if (routeUser.response) {
    return routeUser.response;
  }

  const payload = (await request.json().catch(() => null)) as UpdateProfilePayload | null;
  const mutationClient = getProfileMutationClient(routeUser.accessToken);

  if (!mutationClient) {
    return NextResponse.json(
      { message: "Supabase server credentials are not configured." },
      { status: 500 },
    );
  }

  const updateData: Record<string, unknown> = {};
  let shippingAddressChanged = false;

  if (typeof payload?.full_name === "string") {
    updateData.full_name = payload.full_name.trim();
  }

  if (typeof payload?.phone === "string") {
    const phone = payload.phone.trim();
    if (!phone) {
      return NextResponse.json(
        { message: "Phone number cannot be empty." },
        { status: 400 },
      );
    }
    updateData.phone = phone;
  }

  if (typeof payload?.campaign_opt_out === "boolean") {
    updateData.campaign_opt_out = payload.campaign_opt_out;
  }

  if (payload?.shipping_address && typeof payload.shipping_address === "object") {
    const shippingAddress = normalizeShippingAddress(
      payload.shipping_address as Partial<ShippingAddress>,
    );
    if (!hasSavedShippingAddress(shippingAddress)) {
      return NextResponse.json(
        { message: "Name, phone, address, city, and state are required." },
        { status: 400 },
      );
    }
    updateData.shipping_address = shippingAddress;
    shippingAddressChanged = true;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { message: "No profile changes were provided." },
      { status: 400 },
    );
  }

  let { error } = await mutationClient
    .from("user_profiles")
    .update(updateData)
    .eq("id", routeUser.user.id);

  if (
    error &&
    isMissingUserProfileColumnError(error, "campaign_opt_out") &&
    "campaign_opt_out" in updateData
  ) {
    delete updateData.campaign_opt_out;
    ({ error } = await mutationClient
      .from("user_profiles")
      .update(updateData)
      .eq("id", routeUser.user.id));
  }

  if (error) {
    return NextResponse.json(
      { message: error.message || "Could not update your profile." },
      { status: 500 },
    );
  }

  if (shippingAddressChanged) {
    revalidateTag("registries", "max");
  }

  const profile = await loadServerUserProfile(
    routeUser.user.id,
    routeUser.accessToken,
  );

  return NextResponse.json({ profile });
}
