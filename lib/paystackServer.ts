import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY?.trim() ?? "";

export const hasPaystackServerEnv = Boolean(paystackSecretKey);

export type PaystackMetadata = Record<string, unknown>;

export type PaystackVerifiedTransaction = {
  addedFees: number | null;
  amount: number;
  currency: string;
  fees: number | null;
  id: number;
  metadata: PaystackMetadata;
  originalAmount: number | null;
  paid_at?: string | null;
  reference: string;
  status: string;
};

export function getPaystackMetadataValue(metadata: PaystackMetadata, name: string) {
  const directValue = metadata[name];
  if (typeof directValue === "string" || typeof directValue === "number") return String(directValue).trim();
  const customFields = metadata.custom_fields;
  if (!Array.isArray(customFields)) return "";
  for (const field of customFields) {
    if (!field || typeof field !== "object" || Array.isArray(field)) continue;
    const value = field as Record<string, unknown>;
    if (value.variable_name === name && (typeof value.value === "string" || typeof value.value === "number")) return String(value.value).trim();
  }
  return "";
}

export function matchesPaystackOrderAmount(payment: PaystackVerifiedTransaction, total: number | string) {
  const expectedAmountKobo = Math.round(Number(total) * 100);
  const amounts = [payment.amount, payment.originalAmount, payment.fees === null ? null : payment.amount - payment.fees];
  return Number.isSafeInteger(expectedAmountKobo) && amounts.includes(expectedAmountKobo);
}

export function isPaystackWebhookSignatureValid(body: string, signature: string | null) {
  if (!hasPaystackServerEnv || !signature) return false;
  const expected = createHmac("sha512", paystackSecretKey).update(body).digest();
  const received = Buffer.from(signature.trim(), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type PaystackVerifyResponse = {
  data?: {
    added_fees?: number;
    amount?: number;
    currency?: string;
    fees?: number | null;
    id?: number;
    metadata?: unknown;
    original_amount?: number;
    paid_at?: string | null;
    reference?: string;
    status?: string;
  } | null;
  message?: string;
  status?: boolean;
};

function normalizeMetadata(value: unknown): PaystackMetadata {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizeMetadata(parsed);
    } catch {
      return {};
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as PaystackMetadata;
  }

  return {};
}

function parseKoboAmount(value: unknown, fieldName: string, minimum: number) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount < minimum) {
    throw new Error(`Paystack returned an invalid ${fieldName}.`);
  }

  return amount;
}

export async function verifyPaystackTransaction(reference: string) {
  if (!hasPaystackServerEnv) {
    throw new Error("Add PAYSTACK_SECRET_KEY to verify Paystack payments.");
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
      },
      method: "GET",
    },
  );

  const payload = (await response.json().catch(() => null)) as PaystackVerifyResponse | null;

  if (!response.ok || !payload?.status || !payload.data) {
    throw new Error(payload?.message?.trim() || "Paystack verification failed.");
  }

  const amount = parseKoboAmount(payload.data.amount, "transaction amount", 1);
  const id = Number(payload.data.id);
  const currency = payload.data.currency?.trim() ?? "";
  const verifiedReference = payload.data.reference?.trim() ?? reference;
  const paymentStatus = payload.data.status?.trim() ?? "";

  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Paystack returned an invalid transaction id.");
  }

  if (!currency) {
    throw new Error("Paystack returned an invalid transaction currency.");
  }

  if (!verifiedReference) {
    throw new Error("Paystack returned an invalid transaction reference.");
  }

  const hasOriginalAmount =
    payload.data.original_amount !== undefined &&
    payload.data.original_amount !== null;
  const hasAddedFees =
    payload.data.added_fees !== undefined && payload.data.added_fees !== null;
  if (hasOriginalAmount !== hasAddedFees) {
    throw new Error("Paystack returned an incomplete transaction fee breakdown.");
  }

  const originalAmount = hasOriginalAmount
    ? parseKoboAmount(payload.data.original_amount, "original transaction amount", 1)
    : null;
  const addedFees = hasAddedFees
    ? parseKoboAmount(payload.data.added_fees, "transaction fees", 0)
    : null;
  const fees =
    payload.data.fees === undefined || payload.data.fees === null
      ? null
      : parseKoboAmount(payload.data.fees, "transaction fees", 0);

  if (
    originalAmount !== null &&
    addedFees !== null &&
    amount !== originalAmount + addedFees
  ) {
    throw new Error("Paystack returned an inconsistent transaction fee breakdown.");
  }

  return {
    addedFees,
    amount,
    currency,
    fees,
    id,
    metadata: normalizeMetadata(payload.data.metadata),
    originalAmount,
    paid_at: payload.data.paid_at ?? null,
    reference: verifiedReference,
    status: paymentStatus,
  } satisfies PaystackVerifiedTransaction;
}
