import { NextResponse } from "next/server";

import {
  sendBrevoBatchEmail,
  hasBrevoEnv,
  isBrevoSandboxMode,
} from "@/lib/brevo";
import {
  renderNewsletterHtml,
  renderNewsletterText,
} from "@/lib/emailTemplates";
import {
  createSupabaseServerClient,
  hasSupabaseServerEnv,
} from "@/lib/supabaseServer";

type SendNewsletterPayload = {
  subject?: string;
  body?: string;
};

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim() || null;
}

export async function POST(request: Request) {
  if (!hasSupabaseServerEnv) {
    return NextResponse.json(
      { message: "Supabase is not configured for newsletter sending." },
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
      { message: "Supabase is not configured for newsletter sending." },
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

  const payload = (await request.json().catch(() => null)) as SendNewsletterPayload | null;
  const subject = payload?.subject?.trim() ?? "";
  const body = payload?.body?.trim() ?? "";

  if (!subject || !body) {
    return NextResponse.json(
      { message: "Add a subject and message before sending." },
      { status: 400 },
    );
  }

  const { data: subscriberRows, error: subscriberError } = await adminClient
    .from("newsletter_subscribers")
    .select("email")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (subscriberError) {
    console.error("Failed to load newsletter subscribers.", subscriberError);
    return NextResponse.json(
      { message: "Could not load newsletter subscribers." },
      { status: 500 },
    );
  }

  const recipientEmails = Array.from(
    new Set(
      (subscriberRows ?? [])
        .map((subscriber) => subscriber.email?.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (recipientEmails.length === 0) {
    return NextResponse.json(
      { message: "There are no active newsletter subscribers yet." },
      { status: 400 },
    );
  }

  if (!hasBrevoEnv) {
    return NextResponse.json(
      { message: "Add your Brevo mail settings to send newsletters." },
      { status: 500 },
    );
  }

  const html = renderNewsletterHtml({ subject, body });
  const text = renderNewsletterText({ subject, body });
  const sentRecipients: string[] = [];

  try {
    for (let index = 0; index < recipientEmails.length; index += 1000) {
      const chunk = recipientEmails.slice(index, index + 1000);

      await sendBrevoBatchEmail({
        htmlContent: html,
        messageVersions: chunk.map((email) => ({
          to: [{ email }],
        })),
        subject,
        tags: ["newsletter"],
        textContent: text,
      });

      sentRecipients.push(...chunk);
    }
  } catch (error) {
    console.error("Failed to send newsletter email.", error);

    await adminClient.from("newsletter_campaigns").insert({
      subject,
      body,
      status: "failed",
      recipient_count: sentRecipients.length,
      created_by: user.id,
    });

    if (sentRecipients.length > 0) {
      const partialSentAt = new Date().toISOString();

      await adminClient
        .from("newsletter_subscribers")
        .update({ last_sent_at: partialSentAt })
        .in("email", sentRecipients);
    }

    return NextResponse.json(
      {
        message:
          sentRecipients.length > 0
            ? "The newsletter was only partially sent. Check Brevo before retrying."
            : "The newsletter could not be sent with the current Brevo settings.",
      },
      { status: 500 },
    );
  }

  const sentAt = new Date().toISOString();

  await adminClient.from("newsletter_campaigns").insert({
    subject,
    body,
    status: "sent",
    recipient_count: sentRecipients.length,
    sent_at: sentAt,
    created_by: user.id,
  });

  await adminClient
    .from("newsletter_subscribers")
    .update({ last_sent_at: sentAt })
    .in("email", sentRecipients);

  return NextResponse.json({
    message: "Newsletter sent successfully.",
    recipientCount: sentRecipients.length,
    sandbox: isBrevoSandboxMode,
  });
}
