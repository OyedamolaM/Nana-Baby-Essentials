import { type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  createSupabaseServiceRoleClient,
  createSupabaseServerClient,
  hasSupabaseServerEnv,
  hasSupabaseServiceRoleEnv,
} from "./supabaseServer";
import {
  isMissingUserProfileColumnError,
  normalizeUserProfileRecord,
  USER_PROFILE_FALLBACK_SELECT,
  USER_PROFILE_SELECT,
  type UserProfileRecord,
} from "./userProfile";

export function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim() || null;
}

type RouteUserResult =
  | {
      accessToken: string;
      profile: UserProfileRecord | null;
      response?: undefined;
      user: User;
    }
  | {
      accessToken?: undefined;
      profile?: undefined;
      response: NextResponse;
      user?: undefined;
    };

export async function loadServerUserProfile(
  userId: string,
  accessToken: string,
) {
  const serviceRoleClient = hasSupabaseServiceRoleEnv
    ? createSupabaseServiceRoleClient()
    : null;

  if (serviceRoleClient) {
    const primaryResult = await serviceRoleClient
      .from("user_profiles")
      .select(USER_PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();

    if (!primaryResult.error) {
      return normalizeUserProfileRecord(
        primaryResult.data as UserProfileRecord | null,
      );
    }

    if (isMissingUserProfileColumnError(primaryResult.error)) {
      const fallbackResult = await serviceRoleClient
        .from("user_profiles")
        .select(USER_PROFILE_FALLBACK_SELECT)
        .eq("id", userId)
        .maybeSingle();

      if (!fallbackResult.error) {
        return normalizeUserProfileRecord(
          fallbackResult.data as UserProfileRecord | null,
        );
      }
    }
  }

  const userClient = createSupabaseServerClient(accessToken);
  if (!userClient) {
    return null;
  }

  const primaryResult = await userClient
    .from("user_profiles")
    .select(USER_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (!primaryResult.error) {
    return normalizeUserProfileRecord(
      primaryResult.data as UserProfileRecord | null,
    );
  }

  if (isMissingUserProfileColumnError(primaryResult.error)) {
    const fallbackResult = await userClient
      .from("user_profiles")
      .select(USER_PROFILE_FALLBACK_SELECT)
      .eq("id", userId)
      .maybeSingle();

    if (!fallbackResult.error) {
      return normalizeUserProfileRecord(
        fallbackResult.data as UserProfileRecord | null,
      );
    }
  }

  return null;
}

export async function requireRouteUser(
  request: Request,
): Promise<RouteUserResult> {
  if (!hasSupabaseServerEnv) {
    return {
      response: NextResponse.json(
        { message: "Supabase server credentials are not configured." },
        { status: 500 },
      ),
    };
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return {
      response: NextResponse.json({ message: "Unauthorized." }, { status: 401 }),
    };
  }

  const authClient = createSupabaseServerClient();

  if (!authClient) {
    return {
      response: NextResponse.json(
        { message: "Supabase server credentials are not configured." },
        { status: 500 },
      ),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      response: NextResponse.json({ message: "Unauthorized." }, { status: 401 }),
    };
  }

  return {
    accessToken,
    profile: await loadServerUserProfile(user.id, accessToken),
    user,
  };
}

export async function requireAdminRoute(
  request: Request,
): Promise<RouteUserResult> {
  const result = await requireRouteUser(request);
  if (result.response) {
    return result;
  }

  if (
    !result.profile?.is_admin ||
    result.profile.deleted_at ||
    result.profile.account_status === "disabled"
  ) {
    return {
      response: NextResponse.json(
        { message: "Admin access required." },
        { status: 403 },
      ),
    };
  }

  return result;
}
