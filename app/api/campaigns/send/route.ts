import { NextResponse } from "next/server";

import { normalizeCampaignEmail } from "@/lib/campaignEmail";
import { buildCampaignUnsubscribeUrl } from "@/lib/campaignPreferences";
import {
  hasBrevoEnv,
  isBrevoSandboxMode,
  sendBrevoEmail,
} from "@/lib/brevo";
import {
  renderCustomerCampaignHtml,
  renderCustomerCampaignText,
} from "@/lib/emailTemplates";
import {
  createSupabaseServerClient,
  hasSupabaseServerEnv,
} from "@/lib/supabaseServer";

type SendCampaignPayload = {
  body?: string;
  subject?: string;
};

type CustomerRecipientRow = {
  account_status?: string | null;
  campaign_opt_out?: boolean | null;
  deleted_at?: string | null;
  email?: string | null;
  full_name?: string | null;
  is_admin?: boolean | null;
  id?: string;
  phone?: string | null;
};

type CampaignContactRow = {
  email?: string | null;
  full_name?: string | null;
  id: string;
  is_active?: boolean | null;
  unsubscribed_at?: string | null;
};

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim() || null;
}

async function recordCampaign(args: {
  adminClient: NonNullable<ReturnType<typeof createSupabaseServerClient>>;
  body: string;
  createdBy: string;
  recipientCount: number;
  sentAt?: string;
  status: "failed" | "sent";
  subject: string;
}) {
  const payload = {
    body: args.body,
    campaign_type: "customer",
    created_by: args.createdBy,
    recipient_count: args.recipientCount,
    sent_at: args.sentAt ?? null,
    status: args.status,
    subject: args.subject,
  };

  const { error } = await args.adminClient.from("newsletter_campaigns").insert(payload);
  if (!error) {
    return;
  }

  if (error.code === "42703") {
    await args.adminClient.from("newsletter_campaigns").insert({
      body: args.body,
      created_by: args.createdBy,
      recipient_count: args.recipientCount,
      sent_at: args.sentAt ?? null,
      status: args.status,
      subject: args.subject,
    });
  }
}

async function loadCustomerRecipients(
  adminClient: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
) {
  const primaryResult = await adminClient
    .from("user_profiles")
    .select("id, email, full_name, phone, is_admin, account_status, deleted_at, campaign_opt_out")
    .or("is_admin.eq.false,is_admin.is.null")
    .order("created_at", { ascending: false });

  if (!primaryResult.error) {
    return (primaryResult.data ?? []) as CustomerRecipientRow[];
  }

  if (primaryResult.error.code !== "42703") {
    throw primaryResult.error;
  }

  const fallbackResult = await adminClient
    .from("user_profiles")
    .select("id, email, full_name, phone, is_admin")
    .or("is_admin.eq.false,is_admin.is.null")
    .order("created_at", { ascending: false });

  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  return (fallbackResult.data ?? []) as CustomerRecipientRow[];
}

async function loadManualCampaignContacts(
  adminClient: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
) {
  const result = await adminClient
    .from("campaign_contacts")
    .select("id, email, full_name, is_active, unsubscribed_at")
    .order("created_at", { ascending: false });

  if (!result.error) {
    return (result.data ?? []) as CampaignContactRow[];
  }

  if (result.error.code === "42P01") {
    return [] as CampaignContactRow[];
  }

  throw result.error;
}

export async function POST(request: Request) {
  if (!hasSupabaseServerEnv) {
    return NextResponse.json(
      { message: "Supabase is not configured for campaign sending." },
      { status: 500 },
    );
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const authClient = createSupabaseServerClient();
  const adminClient = createSupabaseServerClient(accessToken);

  if (!authClient || !adminClient) {
    return NextResponse.json(
      { message: "Supabase is not configured for campaign sending." },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await adminClient
    .from("user_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_admin) {
    return NextResponse.json({ message: "Admin access required." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as SendCampaignPayload | null;
  const subject = payload?.subject?.trim() ?? "";
  const body = payload?.body?.trim() ?? "";

  if (!subject || !body) {
    return NextResponse.json(
      { message: "Add a subject and message before sending." },
      { status: 400 },
    );
  }

  let recipientRows: CustomerRecipientRow[];
  let manualContacts: CampaignContactRow[];
  try {
    recipientRows = await loadCustomerRecipients(adminClient);
    manualContacts = await loadManualCampaignContacts(adminClient);
  } catch (error) {
    console.error("Failed to load customer campaign recipients.", error);
    return NextResponse.json(
      { message: "Could not load customer recipients." },
      { status: 500 },
    );
  }

  const blockedEmails = new Set(
    recipientRows
      .filter((recipient) => Boolean(recipient.campaign_opt_out))
      .map((recipient) => normalizeCampaignEmail(recipient.email ?? ""))
      .filter(Boolean),
  );

  const recipientMap = new Map<
    string,
    { email: string; fullName?: string | null; source: "customer" | "manual" }
  >();

  for (const recipient of recipientRows) {
    const email = normalizeCampaignEmail(recipient.email ?? "");
    const isDisabled = recipient.account_status === "disabled";
    const isDeleted = Boolean(recipient.deleted_at);
    const isOptedOut = Boolean(recipient.campaign_opt_out);

    if (!email || recipient.is_admin || isDisabled || isDeleted || isOptedOut) {
      continue;
    }

    recipientMap.set(email, {
      email,
      fullName: recipient.full_name,
      source: "customer",
    });
  }

  for (const contact of manualContacts) {
    const email = normalizeCampaignEmail(contact.email ?? "");
    const isInactive = contact.is_active === false || Boolean(contact.unsubscribed_at);

    if (!email || isInactive || blockedEmails.has(email)) {
      continue;
    }

    if (!recipientMap.has(email)) {
      recipientMap.set(email, {
        email,
        fullName: contact.full_name,
        source: "manual",
      });
    }
  }

  const recipients = Array.from(recipientMap.values());

  if (recipients.length === 0) {
    return NextResponse.json(
      { message: "There are no customer email recipients available yet." },
      { status: 400 },
    );
  }

  if (!hasBrevoEnv) {
    return NextResponse.json(
      { message: "Add your Brevo mail settings to send customer campaigns." },
      { status: 500 },
    );
  }

  const sentRecipients: string[] = [];

  try {
    for (let index = 0; index < recipients.length; index += 20) {
      const chunk = recipients.slice(index, index + 20);

      await Promise.all(
        chunk.map(async (recipient) => {
          const unsubscribeUrl = buildCampaignUnsubscribeUrl(recipient.email);
          const html = renderCustomerCampaignHtml({
            subject,
            body,
            unsubscribeUrl,
          });
          const text = renderCustomerCampaignText({
            subject,
            body,
            unsubscribeUrl,
          });

          await sendBrevoEmail({
            htmlContent: html,
            senderProfile: "default",
            subject,
            tags: ["customer-campaign"],
            textContent: text,
            to: [
              {
                email: recipient.email,
                name: recipient.fullName?.trim() || undefined,
              },
            ],
          });
          sentRecipients.push(recipient.email);
        }),
      );
    }
  } catch (error) {
    console.error("Failed to send customer campaign email.", error);

    await recordCampaign({
      adminClient,
      body,
      createdBy: user.id,
      recipientCount: sentRecipients.length,
      status: "failed",
      subject,
    });

    return NextResponse.json(
      {
        message:
          sentRecipients.length > 0
            ? "The campaign was only partially sent. Check Brevo before retrying."
            : "The campaign could not be sent with the current Brevo settings.",
      },
      { status: 500 },
    );
  }

  const sentAt = new Date().toISOString();

  await recordCampaign({
    adminClient,
    body,
    createdBy: user.id,
    recipientCount: sentRecipients.length,
    sentAt,
    status: "sent",
    subject,
  });

  if (sentRecipients.length > 0) {
    await adminClient
      .from("campaign_contacts")
      .update({ last_sent_at: sentAt })
      .in("email", sentRecipients);
  }

  return NextResponse.json({
    message: "Campaign sent successfully.",
    recipientCount: sentRecipients.length,
    sandbox: isBrevoSandboxMode,
  });
}
