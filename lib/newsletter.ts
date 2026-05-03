import "server-only";

type NewsletterHtmlOptions = {
  subject: string;
  body: string;
};

type NewsletterMailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function getNewsletterMailConfig(): NewsletterMailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "465");
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim() || user;
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "Nana's Baby Essentials";
  const replyTo = process.env.SMTP_REPLY_TO?.trim();

  if (!host || !Number.isFinite(port) || !user || !password || !fromEmail) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    user,
    password,
    fromEmail,
    fromName,
    replyTo,
  };
}

export function renderNewsletterHtml({
  subject,
  body,
}: NewsletterHtmlOptions) {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) =>
      `<p style="margin:0 0 16px;line-height:1.7;color:#334155;">${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#fff7ed;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="margin:0 auto;max-width:640px;overflow:hidden;border-radius:24px;background:#ffffff;box-shadow:0 20px 40px rgba(15,23,42,0.08);">
      <div style="background:linear-gradient(135deg,#fb7185,#f97316);padding:28px 32px;color:#ffffff;">
        <div style="font-size:13px;letter-spacing:0.16em;text-transform:uppercase;opacity:0.9;">Nana's Baby Essentials</div>
        <h1 style="margin:12px 0 0;font-size:30px;line-height:1.2;">${escapeHtml(subject)}</h1>
      </div>
      <div style="padding:32px;">
        ${paragraphs}
      </div>
      <div style="border-top:1px solid #e2e8f0;padding:20px 32px;background:#f8fafc;font-size:13px;line-height:1.6;color:#64748b;">
        Sent by Nana's Baby Essentials.
      </div>
    </div>
  </body>
</html>`;
}

export function renderNewsletterText({
  subject,
  body,
}: NewsletterHtmlOptions) {
  return `${subject}\n\n${body.trim()}\n\nSent by Nana's Baby Essentials.`;
}
