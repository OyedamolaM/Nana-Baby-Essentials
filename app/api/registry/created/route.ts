import { NextResponse } from "next/server";

import {
  createBrevoIdempotencyKey,
  hasBrevoEnv,
  sendBrevoEmail,
} from "@/lib/brevo";
import { renderRegistryCreatedEmail } from "@/lib/emailTemplates";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabaseServerEnv,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type RegistryCreatedPayload = {
  registryId?: string;
};

type RegistryRecord = {
  additional_info?: string | null;
  baby_gender?: string | null;
  due_month?: string | null;
  id: string;
  name: string;
  share_code: string;
  user_id: string;
  whatsapp?: string | null;
};

type UserProfileRecord = {
  email?: string | null;
  full_name?: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim() || null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

export async function POST(request: Request) {
  if (!hasSupabaseServerEnv || !hasSupabaseServiceRoleEnv) {
    return jsonError(
      "Supabase server credentials are not configured for registry emails.",
      500,
    );
  }

  if (!hasBrevoEnv) {
    return jsonError("Brevo is not configured for registry emails.", 500);
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return jsonError("Unauthorized.", 401);
  }

  const authClient = createSupabaseServerClient();
  const adminClient = createSupabaseServiceRoleClient();

  if (!authClient || !adminClient) {
    return jsonError(
      "Supabase server credentials are not configured for registry emails.",
      500,
    );
  }

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return jsonError("Unauthorized.", 401);
  }

  const payload = (await request.json().catch(() => null)) as RegistryCreatedPayload | null;
  const registryId = payload?.registryId?.trim() ?? "";

  if (!registryId) {
    return jsonError("Registry id is required.", 400);
  }

  const [{ data: registry, error: registryError }, { data: profile, error: profileError }] =
    await Promise.all([
      adminClient
        .from("registries")
        .select(
          "id, user_id, name, share_code, due_month, baby_gender, whatsapp, additional_info",
        )
        .eq("id", registryId)
        .maybeSingle<RegistryRecord>(),
      adminClient
        .from("user_profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .maybeSingle<UserProfileRecord>(),
    ]);

  if (registryError) {
    console.error("Failed to load registry for email.", registryError);
    return jsonError("Could not load this registry for email.", 500);
  }

  if (!registry || registry.user_id !== user.id) {
    return jsonError("Registry not found.", 404);
  }

  if (profileError) {
    console.error("Failed to load user profile for registry email.", profileError);
  }

  const recipientEmail = profile?.email?.trim() || user.email?.trim() || "";
  if (!recipientEmail) {
    return jsonError("This account does not have an email address yet.", 400);
  }

  const origin = request.headers.get("origin")?.trim() || new URL(request.url).origin;
  const shareUrl = `${origin}/registry/${registry.share_code}`;
  const email = renderRegistryCreatedEmail({
    additionalInfo: registry.additional_info ?? null,
    babyGender: registry.baby_gender ?? null,
    customerEmail: recipientEmail,
    customerName: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    dueMonth: registry.due_month ?? null,
    registryName: registry.name,
    shareCode: registry.share_code,
    shareUrl,
    whatsapp: registry.whatsapp ?? null,
  });

  try {
    const result = await sendBrevoEmail({
      htmlContent: email.html,
      idempotencyKey: createBrevoIdempotencyKey(`registry-created:${registry.id}`),
      subject: email.subject,
      tags: ["registry-created"],
      textContent: email.text,
      to: [
        {
          email: recipientEmail,
          name: profile?.full_name?.trim() || undefined,
        },
      ],
    });

    return NextResponse.json({
      message: "Registry confirmation email sent.",
      sandbox: result.sandbox,
    });
  } catch (error) {
    console.error("Failed to send registry confirmation email.", error);
    return jsonError(
      getErrorMessage(error, "Could not send the registry confirmation email."),
      502,
    );
  }
}
