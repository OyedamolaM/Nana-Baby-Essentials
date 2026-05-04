import "server-only";

const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY?.trim() ?? "";

export const hasPaystackServerEnv = Boolean(paystackSecretKey);

export type PaystackMetadata = Record<string, unknown>;

export type PaystackVerifiedTransaction = {
  amount: number;
  currency: string;
  id: number;
  metadata: PaystackMetadata;
  paid_at?: string | null;
  reference: string;
  status: string;
};

type PaystackVerifyResponse = {
  data?: {
    amount?: number;
    currency?: string;
    id?: number;
    metadata?: unknown;
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

  const amount = Number(payload.data.amount);
  const id = Number(payload.data.id);
  const currency = payload.data.currency?.trim() ?? "";
  const verifiedReference = payload.data.reference?.trim() ?? reference;
  const paymentStatus = payload.data.status?.trim() ?? "";

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Paystack returned an invalid transaction amount.");
  }

  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Paystack returned an invalid transaction id.");
  }

  if (!currency) {
    throw new Error("Paystack returned an invalid transaction currency.");
  }

  if (!verifiedReference) {
    throw new Error("Paystack returned an invalid transaction reference.");
  }

  return {
    amount,
    currency,
    id,
    metadata: normalizeMetadata(payload.data.metadata),
    paid_at: payload.data.paid_at ?? null,
    reference: verifiedReference,
    status: paymentStatus,
  } satisfies PaystackVerifiedTransaction;
}
