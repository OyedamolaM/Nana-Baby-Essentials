import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

import {
  getNewsletterMailConfig,
  renderNewsletterHtml,
  renderNewsletterText,
} from "@/lib/newsletter";
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

  const mailConfig = getNewsletterMailConfig();
  if (!mailConfig) {
    return NextResponse.json(
      { message: "Add your SMTP mail settings to send newsletters." },
      { status: 500 },
    );
  }

  const transporter = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: {
      user: mailConfig.user,
      pass: mailConfig.password,
    },
  });

  try {
    await transporter.sendMail({
      from: `"${mailConfig.fromName}" <${mailConfig.fromEmail}>`,
      replyTo: mailConfig.replyTo || mailConfig.fromEmail,
      to: mailConfig.fromEmail,
      bcc: recipientEmails,
      subject,
      text: renderNewsletterText({ subject, body }),
      html: renderNewsletterHtml({ subject, body }),
    });
  } catch (error) {
    console.error("Failed to send newsletter email.", error);

    await adminClient.from("newsletter_campaigns").insert({
      subject,
      body,
      status: "failed",
      recipient_count: recipientEmails.length,
      created_by: user.id,
    });

    return NextResponse.json(
      { message: "The newsletter could not be sent with the current mail settings." },
      { status: 500 },
    );
  }

  const sentAt = new Date().toISOString();

  await adminClient.from("newsletter_campaigns").insert({
    subject,
    body,
    status: "sent",
    recipient_count: recipientEmails.length,
    sent_at: sentAt,
    created_by: user.id,
  });

  await adminClient
    .from("newsletter_subscribers")
    .update({ last_sent_at: sentAt })
    .in("email", recipientEmails);

  return NextResponse.json({
    message: "Newsletter sent successfully.",
    recipientCount: recipientEmails.length,
  });
}
