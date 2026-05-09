import { type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  createSupabaseServerClient,
  hasSupabaseServerEnv,
} from "./supabaseServer";
import { type UserProfileRecord } from "./userProfile";

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
  const userClient = createSupabaseServerClient(accessToken);

  if (!authClient || !userClient) {
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

  const { data: profile } = await userClient
    .from("user_profiles")
    .select(
      "id, email, full_name, phone, is_admin, shipping_address, account_status, deleted_at, created_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  return {
    accessToken,
    profile: (profile as UserProfileRecord | null) ?? null,
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
