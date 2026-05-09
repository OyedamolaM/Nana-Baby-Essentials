import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeCampaignEmail } from "./campaignEmail";
import { buildAbsoluteUrl } from "./site";

function normalizeSecret() {
  return (
    process.env.CAMPAIGN_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.BREVO_API_KEY?.trim() ||
    "nbe-campaigns"
  );
}

export function createCampaignUnsubscribeToken(email: string) {
  return createHmac("sha256", normalizeSecret())
    .update(normalizeCampaignEmail(email))
    .digest("hex");
}

export function verifyCampaignUnsubscribeToken(email: string, token: string) {
  const normalizedToken = token.trim().toLowerCase();
  const expectedToken = createCampaignUnsubscribeToken(email);

  if (normalizedToken.length !== expectedToken.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(normalizedToken, "utf8"),
      Buffer.from(expectedToken, "utf8"),
    );
  } catch {
    return false;
  }
}

export function buildCampaignUnsubscribeUrl(email: string) {
  const normalizedEmail = normalizeCampaignEmail(email);
  const token = createCampaignUnsubscribeToken(normalizedEmail);

  return buildAbsoluteUrl(
    `/api/campaigns/unsubscribe?email=${encodeURIComponent(normalizedEmail)}&token=${encodeURIComponent(token)}`,
  );
}
