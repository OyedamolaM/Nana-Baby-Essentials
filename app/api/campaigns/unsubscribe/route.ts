import { NextResponse } from "next/server";

import { normalizeCampaignEmail } from "@/lib/campaignEmail";
import { verifyCampaignUnsubscribeToken } from "@/lib/campaignPreferences";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

function renderHtml(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:32px 16px;background:#fff7fb;font-family:Arial,sans-serif;color:#111827;">
    <main style="margin:0 auto;max-width:560px;border:1px solid #f3d4e3;border-radius:28px;background:#ffffff;padding:32px;box-shadow:0 24px 60px rgba(15,23,42,0.08);">
      <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#ec4899;">Campaign Preferences</p>
      <h1 style="margin:0 0 14px;font-size:30px;line-height:1.2;color:#111827;">${title}</h1>
      <p style="margin:0;font-size:16px;line-height:1.8;color:#4b5563;">${message}</p>
    </main>
  </body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function GET(request: Request) {
  if (!hasSupabaseServiceRoleEnv) {
    return renderHtml(
      "Preferences unavailable",
      "Campaign preferences are not configured on this environment yet.",
      500,
    );
  }

  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return renderHtml(
      "Preferences unavailable",
      "Campaign preferences are not configured on this environment yet.",
      500,
    );
  }

  const url = new URL(request.url);
  const email = normalizeCampaignEmail(url.searchParams.get("email") ?? "");
  const token = url.searchParams.get("token") ?? "";

  if (!email || !token || !verifyCampaignUnsubscribeToken(email, token)) {
    return renderHtml(
      "Invalid unsubscribe link",
      "This campaign opt-out link is invalid or has expired. Please use the unsubscribe link from your latest email.",
      400,
    );
  }

  const { data: matchingProfiles } = await serviceRoleClient
    .from("user_profiles")
    .select("id, email")
    .ilike("email", email);

  const profileIds =
    ((matchingProfiles as Array<{ id: string; email?: string | null }> | null) ?? []).map(
      (profile) => profile.id,
    );

  if (profileIds.length > 0) {
    await serviceRoleClient
      .from("user_profiles")
      .update({ campaign_opt_out: true })
      .in("id", profileIds);
  }

  await serviceRoleClient
    .from("campaign_contacts")
    .update({
      is_active: false,
      unsubscribed_at: new Date().toISOString(),
    })
    .ilike("email", email);

  return renderHtml(
    "You have opted out",
    "You will no longer receive customer campaign emails from Nana's Baby Essentials unless you opt back in from your dashboard or are re-added manually.",
  );
}
