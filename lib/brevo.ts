import "server-only";

import { createHash } from "node:crypto";

const brevoApiKey = process.env.BREVO_API_KEY?.trim() ?? "";
const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL?.trim() ?? "";
const brevoSenderName =
  process.env.BREVO_SENDER_NAME?.trim() ?? "Nana's Baby Essentials";
const brevoReplyTo = process.env.BREVO_REPLY_TO?.trim() ?? "";
const brevoOrderSenderEmail =
  process.env.BREVO_ORDER_SENDER_EMAIL?.trim() ?? brevoSenderEmail;
const brevoOrderSenderName =
  process.env.BREVO_ORDER_SENDER_NAME?.trim() ?? brevoSenderName;
const brevoOrderReplyTo =
  process.env.BREVO_ORDER_REPLY_TO?.trim() ?? brevoReplyTo;
const brevoOrderSupportEmail =
  process.env.BREVO_ORDER_SUPPORT_EMAIL?.trim() ?? "";
const brevoSandboxMode = process.env.BREVO_SANDBOX_MODE?.trim() === "true";

export const hasBrevoEnv = Boolean(brevoApiKey && brevoSenderEmail);
export const isBrevoSandboxMode = brevoSandboxMode;
export const hasBrevoOrderSupportRecipient = Boolean(brevoOrderSupportEmail);

export function getBrevoOrderSupportRecipient() {
  return brevoOrderSupportEmail;
}

type BrevoSenderProfile = "default" | "order";

type BrevoRecipient = {
  email: string;
  name?: string;
};

type BrevoAttachment = {
  content: string;
  name: string;
};

type BrevoParams = Record<string, unknown>;

type BrevoBasePayload = {
  attachments?: BrevoAttachment[];
  params?: BrevoParams;
  replyTo?: BrevoRecipient;
  senderProfile?: BrevoSenderProfile;
  subject: string;
  tags?: string[];
};

type BrevoHtmlPayload = BrevoBasePayload & {
  htmlContent: string;
  templateId?: never;
  textContent?: string;
};

type BrevoTemplatePayload = BrevoBasePayload & {
  htmlContent?: never;
  templateId: number;
  textContent?: never;
};

type BrevoSingleEmailPayload = (BrevoHtmlPayload | BrevoTemplatePayload) & {
  idempotencyKey?: string;
  to: BrevoRecipient[];
};

type BrevoMessageVersion = {
  params?: BrevoParams;
  subject?: string;
  to: BrevoRecipient[];
};

type BrevoBatchEmailPayload = (BrevoHtmlPayload | BrevoTemplatePayload) & {
  idempotencyKey?: string;
  messageVersions: BrevoMessageVersion[];
};

type BrevoApiResponse = {
  code?: string;
  message?: string;
  messageId?: string;
  messageIds?: string[];
};

function normalizeHeaders(idempotencyKey?: string) {
  const headers: Record<string, string> = {};

  if (brevoSandboxMode) {
    headers["X-Sib-Sandbox"] = "drop";
  }

  if (idempotencyKey) {
    headers.idempotencyKey = idempotencyKey;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function getSenderConfig(profile: BrevoSenderProfile = "default") {
  if (profile === "order") {
    return {
      email: brevoOrderSenderEmail,
      name: brevoOrderSenderName,
      replyTo: brevoOrderReplyTo,
    };
  }

  return {
    email: brevoSenderEmail,
    name: brevoSenderName,
    replyTo: brevoReplyTo,
  };
}

function createBody(
  payload:
    | BrevoSingleEmailPayload
    | BrevoBatchEmailPayload,
) {
  const sender = getSenderConfig(payload.senderProfile);

  const body: Record<string, unknown> = {
    headers: normalizeHeaders(payload.idempotencyKey),
    replyTo:
      payload.replyTo ??
      (sender.replyTo ? { email: sender.replyTo, name: sender.name } : undefined),
    sender: {
      email: sender.email,
      name: sender.name,
    },
    subject: payload.subject,
    tags: payload.tags,
  };

  if ("templateId" in payload) {
    body.templateId = payload.templateId;
    body.params = payload.params;
  } else {
    body.htmlContent = payload.htmlContent;
    body.params = payload.params;
    body.textContent = payload.textContent;
  }

  if (payload.attachments?.length) {
    body.attachment = payload.attachments;
  }

  if ("messageVersions" in payload) {
    body.messageVersions = payload.messageVersions;
  } else {
    body.to = payload.to;
  }

  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  );
}

async function sendBrevoRequest(
  payload:
    | BrevoSingleEmailPayload
    | BrevoBatchEmailPayload,
) {
  if (!hasBrevoEnv) {
    throw new Error(
      "Add BREVO_API_KEY and BREVO_SENDER_EMAIL before sending emails.",
    );
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    body: JSON.stringify(createBody(payload)),
    cache: "no-store",
    headers: {
      accept: "application/json",
      "api-key": brevoApiKey,
      "content-type": "application/json",
    },
    method: "POST",
  });

  const result = (await response.json().catch(() => null)) as BrevoApiResponse | null;

  if (!response.ok) {
    throw new Error(
      result?.message?.trim() ||
        result?.code?.trim() ||
        "Brevo could not send this email.",
    );
  }

  const messageIds = Array.isArray(result?.messageIds)
    ? result.messageIds.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      )
    : typeof result?.messageId === "string" && result.messageId.trim()
      ? [result.messageId.trim()]
      : [];

  return {
    messageIds,
    sandbox: brevoSandboxMode,
  };
}

export function createBrevoIdempotencyKey(seed: string) {
  const hash = createHash("sha256").update(seed).digest("hex");
  const thirdGroup = `4${hash.slice(13, 16)}`;
  const variantNibble = ((Number.parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8)
    .toString(16);
  const fourthGroup = `${variantNibble}${hash.slice(17, 20)}`;

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    thirdGroup,
    fourthGroup,
    hash.slice(20, 32),
  ].join("-");
}

export async function sendBrevoEmail(payload: BrevoSingleEmailPayload) {
  return sendBrevoRequest(payload);
}

export async function sendBrevoBatchEmail(payload: BrevoBatchEmailPayload) {
  return sendBrevoRequest(payload);
}
