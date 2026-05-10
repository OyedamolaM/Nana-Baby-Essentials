export const PAYMENT_METHOD_OPTIONS = [
  { label: "Paystack", value: "paystack" },
  { label: "Cash", value: "cash" },
  { label: "Bank Transfer", value: "bank_transfer" },
  { label: "POS", value: "pos" },
  { label: "Manual", value: "manual" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]["value"];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  manual: "Manual",
  paystack: "Paystack",
  pos: "POS",
};

export function normalizePaymentMethodValue(
  value?: string | null,
): PaymentMethod | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return PAYMENT_METHOD_OPTIONS.some((option) => option.value === normalizedValue)
    ? (normalizedValue as PaymentMethod)
    : null;
}

export function getOrderPaymentMethodValue(
  value?: string | null,
  paymentReference?: string | null,
): PaymentMethod {
  const normalizedValue = normalizePaymentMethodValue(value);
  if (normalizedValue) {
    return normalizedValue;
  }

  return paymentReference?.trim() ? "paystack" : "manual";
}

export function formatPaymentMethodLabel(
  value?: string | null,
  paymentReference?: string | null,
) {
  return PAYMENT_METHOD_LABELS[getOrderPaymentMethodValue(value, paymentReference)];
}

export function formatPaymentReferenceDisplay(
  value?: string | null,
  maxLength = 18,
) {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 8)}...${normalizedValue.slice(-6)}`;
}
