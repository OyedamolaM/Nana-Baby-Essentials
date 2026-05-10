import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { toNairaAmount } from "@/lib/commerce";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";
import {
  hasSavedShippingAddress,
  normalizeShippingAddress,
} from "@/lib/userProfile";
import {
  hasPaystackServerEnv,
  verifyPaystackTransaction,
  type PaystackMetadata,
} from "@/lib/paystackServer";

type RegistryCheckoutItemInput = {
  registryItemId: string;
  quantity: number;
};

type InitiateRegistryCheckoutPayload = {
  action: "initiate";
  buyerEmail?: string;
  buyerMessage?: string;
  buyerName?: string;
  buyerPhone?: string;
  paymentAmount?: number | string;
  registryId?: string;
  selectedItems?: RegistryCheckoutItemInput[];
  shippingAddress?: Record<string, unknown> | null;
};

type VerifyRegistryCheckoutPayload = {
  action: "verify";
  reference?: string;
};

type CancelRegistryCheckoutPayload = {
  action: "cancel";
  reference?: string;
};

type RegistryCheckoutPayload =
  | InitiateRegistryCheckoutPayload
  | VerifyRegistryCheckoutPayload
  | CancelRegistryCheckoutPayload;

type RegistryCheckoutSession = {
  amount_kobo: number;
  checkout_type: "item" | "cash";
  item_total: number;
  metadata: PaystackMetadata;
  payment_amount: number;
  paystack_reference: string;
  registry_contribution_id: string | null;
  registry_order_id: string | null;
  selection_total: number;
};

type RegistryCheckoutCompletion = {
  checkout_type: "item" | "cash";
  paystack_reference: string;
  registry_contribution_id: string | null;
  registry_id: string;
  registry_order_id: string | null;
  status: "paid" | "cancelled";
};

type SupabaseRpcErrorLike = {
  code?: string | null;
  message?: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (error && typeof error === "object") {
    const maybeError = error as SupabaseRpcErrorLike;
    if (maybeError.message?.trim()) {
      return maybeError.message.trim();
    }
  }

  return fallback;
}

function isMissingFunctionError(error: unknown, functionName: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as SupabaseRpcErrorLike;
  return (
    maybeError.code === "PGRST202" ||
    maybeError.message?.includes(`function public.${functionName}`) ||
    maybeError.message?.includes(`Could not find the function public.${functionName}`)
  );
}

function shouldFallbackRegistryCheckoutRpc(error: unknown, functionName: string) {
  if (isMissingFunctionError(error, functionName)) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as SupabaseRpcErrorLike;
  if (maybeError.code === "42883") {
    return maybeError.message?.includes("function min(uuid) does not exist") ?? false;
  }

  return maybeError.message?.includes("function min(uuid) does not exist") ?? false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePaymentAmount(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed * 100) / 100;
}

function normalizeSelectedItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ quantity: number; registry_item_id: string }>;
  }

  return value
    .filter((item): item is RegistryCheckoutItemInput => {
      return (
        isRecord(item) &&
        typeof item.registryItemId === "string" &&
        item.registryItemId.trim().length > 0 &&
        Number.isFinite(Number(item.quantity))
      );
    })
    .map((item) => ({
      quantity: Math.max(0, Math.floor(Number(item.quantity))),
      registry_item_id: item.registryItemId.trim(),
    }))
    .filter((item) => item.quantity > 0);
}

function roundCurrencyAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function getSelectedRegistryItemAmount(
  registryItem: {
    funded_amount?: number | null;
    purchased_quantity?: number | null;
    requested_quantity?: number | null;
    unit_price_snapshot?: number | null;
  },
  quantity: number,
) {
  const requestedQuantity = Math.max(1, Number(registryItem.requested_quantity ?? 1));
  const purchasedQuantity = Math.max(0, Number(registryItem.purchased_quantity ?? 0));
  const normalizedQuantity = Math.max(0, Math.floor(quantity));
  const unitAmount = Math.max(0, toNairaAmount(Number(registryItem.unit_price_snapshot ?? 0)));

  if (normalizedQuantity <= 0 || unitAmount <= 0) {
    return 0;
  }

  const targetAmount = unitAmount * requestedQuantity;
  const fundedFallback = unitAmount * purchasedQuantity;
  const fundedAmount = Math.min(
    targetAmount,
    Math.max(0, Number(registryItem.funded_amount ?? fundedFallback)),
  );
  const remainingAmount = Math.max(0, targetAmount - fundedAmount);

  if (remainingAmount <= 0) {
    return 0;
  }

  const partialUnitAmount =
    purchasedQuantity < requestedQuantity ? fundedAmount % unitAmount : 0;

  return Math.min(
    remainingAmount,
    Math.max((normalizedQuantity * unitAmount) - partialUnitAmount, 0),
  );
}

function parseRegistryCheckoutSession(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Registry checkout could not be started.");
  }

  const amountKobo = Number(value.amount_kobo);
  const reference = typeof value.paystack_reference === "string"
    ? value.paystack_reference.trim()
    : "";
  const checkoutType = value.checkout_type === "cash" ? "cash" : "item";

  if (!Number.isFinite(amountKobo) || amountKobo <= 0 || !reference) {
    throw new Error("Registry checkout could not be started.");
  }

  return {
    amount_kobo: amountKobo,
    checkout_type: checkoutType,
    item_total: Number(value.item_total ?? 0),
    metadata: isRecord(value.metadata) ? (value.metadata as PaystackMetadata) : {},
    payment_amount: Number(value.payment_amount ?? 0),
    paystack_reference: reference,
    registry_contribution_id:
      typeof value.registry_contribution_id === "string"
        ? value.registry_contribution_id
        : null,
    registry_order_id:
      typeof value.registry_order_id === "string" ? value.registry_order_id : null,
    selection_total: Number(value.selection_total ?? 0),
  } satisfies RegistryCheckoutSession;
}

function parseRegistryCheckoutCompletion(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Registry checkout could not be finalized.");
  }

  const reference = typeof value.paystack_reference === "string"
    ? value.paystack_reference.trim()
    : "";
  const registryId = typeof value.registry_id === "string"
    ? value.registry_id.trim()
    : "";
  const status = value.status === "cancelled" ? "cancelled" : "paid";
  const checkoutType = value.checkout_type === "cash" ? "cash" : "item";

  if (!reference || !registryId) {
    throw new Error("Registry checkout could not be finalized.");
  }

  return {
    checkout_type: checkoutType,
    paystack_reference: reference,
    registry_contribution_id:
      typeof value.registry_contribution_id === "string"
        ? value.registry_contribution_id
        : null,
    registry_id: registryId,
    registry_order_id:
      typeof value.registry_order_id === "string" ? value.registry_order_id : null,
    status,
  } satisfies RegistryCheckoutCompletion;
}

function createPaystackReference() {
  return `NBE-REG-${crypto.randomUUID()}`;
}

async function handleInitiateCheckout(
  payload: InitiateRegistryCheckoutPayload,
) {
  if (!hasSupabaseServiceRoleEnv) {
    return jsonError(
      "Add SUPABASE_SERVICE_ROLE_KEY before starting registry checkout.",
      500,
    );
  }

  const registryId = payload.registryId?.trim() ?? "";
  const buyerName = payload.buyerName?.trim() ?? "";
  const buyerEmail = payload.buyerEmail?.trim() ?? "";
  const buyerPhone = payload.buyerPhone?.trim() ?? "";
  const buyerMessage = payload.buyerMessage?.trim() ?? "";
  const selectedItems = normalizeSelectedItems(payload.selectedItems);
  const paymentAmount = normalizePaymentAmount(payload.paymentAmount);
  const shippingAddress = normalizeShippingAddress(
    isRecord(payload.shippingAddress) ? payload.shippingAddress : null,
  );

  if (!registryId) {
    return jsonError("Registry id is required.", 400);
  }

  if (!buyerName) {
    return jsonError("Buyer name is required.", 400);
  }

  if (!buyerEmail) {
    return jsonError("Buyer email is required.", 400);
  }

  if (!buyerPhone) {
    return jsonError("Buyer phone number is required.", 400);
  }

  if (!hasSavedShippingAddress(shippingAddress)) {
    return jsonError(
      "This registry cannot accept gifts until the owner saves a shipping address.",
      400,
    );
  }

  if (selectedItems.length === 0 && paymentAmount <= 0) {
    return jsonError("Select registry items or enter a payment amount.", 400);
  }

  const adminClient = createSupabaseServiceRoleClient();
  if (!adminClient) {
    return jsonError(
      "Add SUPABASE_SERVICE_ROLE_KEY before starting registry checkout.",
      500,
    );
  }

  let extraCashAmount = paymentAmount;
  if (selectedItems.length > 0) {
    const selectedItemIds = selectedItems.map((item) => item.registry_item_id);
    const { data: registryItemRows, error: registryItemError } = await adminClient
      .from("registry_items")
      .select("id, funded_amount, requested_quantity, purchased_quantity, unit_price_snapshot")
      .eq("registry_id", registryId)
      .in("id", selectedItemIds);

    if (registryItemError) {
      return jsonError(
        getErrorMessage(
          registryItemError,
          "Selected registry items could not be prepared for checkout.",
        ),
        400,
      );
    }

    const selectedRegistryItems = new Map(
      ((registryItemRows as Array<{
        id: string;
        funded_amount?: number | null;
        purchased_quantity?: number | null;
        requested_quantity?: number | null;
        unit_price_snapshot?: number | null;
      }> | null) ?? []).map((registryItem) => [registryItem.id, registryItem]),
    );

    let selectedItemsTotal = 0;

    for (const selectedItem of selectedItems) {
      const registryItem = selectedRegistryItems.get(selectedItem.registry_item_id);
      if (!registryItem) {
        return jsonError("One or more selected registry items could not be found.", 400);
      }

      const requestedQuantity = Number(registryItem.requested_quantity ?? 0);
      const purchasedQuantity = Number(registryItem.purchased_quantity ?? 0);
      const remainingQuantity = Math.max(requestedQuantity - purchasedQuantity, 0);
      if (selectedItem.quantity > remainingQuantity) {
        return jsonError(
          "Some registry items are no longer available in the requested quantity.",
          400,
        );
      }

      const selectedItemAmount = getSelectedRegistryItemAmount(
        registryItem,
        selectedItem.quantity,
      );
      if (selectedItemAmount <= 0) {
        return jsonError(
          "One or more selected registry items are already fully funded.",
          400,
        );
      }

      selectedItemsTotal += selectedItemAmount;
    }

    selectedItemsTotal = roundCurrencyAmount(selectedItemsTotal);

    if (paymentAmount < selectedItemsTotal) {
      return jsonError(
        "Selected product gifts must be paid in full. Increase the amount to cover the selected items, or remove items and make a cash gift instead.",
        400,
      );
    }

    extraCashAmount = roundCurrencyAmount(paymentAmount - selectedItemsTotal);
  }

  const reference = createPaystackReference();
  const { data, error } = await adminClient.rpc("create_registry_checkout", {
    p_cash_amount: extraCashAmount,
    p_buyer_email: buyerEmail,
    p_buyer_message: buyerMessage || null,
    p_buyer_name: buyerName,
    p_buyer_phone: buyerPhone || null,
    p_paystack_reference: reference,
    p_registry_id: registryId,
    p_selected_items: selectedItems,
  });

  if (error) {
    if (shouldFallbackRegistryCheckoutRpc(error, "create_registry_checkout")) {
      const contributionType =
        selectedItems.length > 0 ? (paymentAmount > 0 ? "mixed" : "items") : "cash";

      const { data: fallbackOrderId, error: fallbackError } = await adminClient.rpc(
        "create_registry_order",
        {
          p_buyer_email: buyerEmail,
          p_buyer_message: buyerMessage || null,
          p_buyer_name: buyerName,
          p_buyer_phone: buyerPhone || null,
          p_contribution_type: contributionType,
          p_registry_id: registryId,
          p_selected_items: selectedItems,
          p_total: paymentAmount,
        },
      );

      if (fallbackError || typeof fallbackOrderId !== "string") {
        return jsonError(
          getErrorMessage(fallbackError, "Registry checkout could not be started."),
          400,
        );
      }

      await adminClient
        .from("registry_orders")
        .update({
          paystack_reference: reference,
          shipping_address: shippingAddress,
        })
        .eq("id", fallbackOrderId);

      return NextResponse.json({
        amountKobo: Math.round(paymentAmount * 100),
        checkoutType: selectedItems.length > 0 ? "item" : "cash",
        currency: "NGN",
        metadata: {
          order_id: fallbackOrderId,
          registry_id: registryId,
          type: selectedItems.length > 0 ? "item" : "cash",
        } satisfies PaystackMetadata,
        reference,
      });
    }

    return jsonError(
      getErrorMessage(error, "Registry checkout could not be started."),
      400,
    );
  }

  try {
    const checkout = parseRegistryCheckoutSession(data);
    return NextResponse.json({
      amountKobo: checkout.amount_kobo,
      checkoutType: checkout.checkout_type,
      currency: "NGN",
      metadata: checkout.metadata,
      reference: checkout.paystack_reference,
    });
  } catch (error) {
    return jsonError(getErrorMessage(error, "Registry checkout could not be started."), 500);
  }
}

async function handleVerifyCheckout(
  payload: VerifyRegistryCheckoutPayload,
) {
  const reference = payload.reference?.trim() ?? "";
  if (!reference) {
    return jsonError("Paystack reference is required.", 400);
  }

  if (!hasSupabaseServiceRoleEnv) {
    return jsonError(
      "Add SUPABASE_SERVICE_ROLE_KEY before verifying registry checkout.",
      500,
    );
  }

  if (!hasPaystackServerEnv) {
    return jsonError(
      "Add PAYSTACK_SECRET_KEY before verifying registry checkout.",
      500,
    );
  }

  const adminClient = createSupabaseServiceRoleClient();
  if (!adminClient) {
    return jsonError(
      "Add SUPABASE_SERVICE_ROLE_KEY before verifying registry checkout.",
      500,
    );
  }

  let verifiedPayment;
  try {
    verifiedPayment = await verifyPaystackTransaction(reference);
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Paystack verification failed."),
      502,
    );
  }

  if (verifiedPayment.reference !== reference) {
    return jsonError("Verified Paystack reference does not match this checkout.", 400);
  }

  if (verifiedPayment.status !== "success") {
    return jsonError("This Paystack transaction is not successful yet.", 400);
  }

  if (verifiedPayment.currency !== "NGN") {
    return jsonError("This registry checkout expects an NGN payment.", 400);
  }

  const metadataRegistryId = String(verifiedPayment.metadata.registry_id ?? "").trim();
  const metadataType = String(verifiedPayment.metadata.type ?? "").trim();

  if (!metadataRegistryId) {
    return jsonError("This Paystack payment is missing the registry id metadata.", 400);
  }

  if (metadataType !== "item" && metadataType !== "cash") {
    return jsonError("This Paystack payment is missing the checkout type metadata.", 400);
  }

  const { data, error } = await adminClient.rpc(
    "complete_registry_checkout_payment",
    {
      p_paid_amount_kobo: verifiedPayment.amount,
      p_paystack_reference: reference,
      p_paystack_transaction_id: verifiedPayment.id,
    },
  );

  if (error) {
    if (shouldFallbackRegistryCheckoutRpc(error, "complete_registry_checkout_payment")) {
      const { data: fallbackOrder, error: fallbackOrderError } = await adminClient
        .from("registry_orders")
        .select("id, registry_id, contribution_type, status, paystack_reference")
        .eq("paystack_reference", reference)
        .maybeSingle();

      if (fallbackOrderError || !fallbackOrder) {
        return jsonError(
          getErrorMessage(fallbackOrderError, "Registry checkout could not be finalized."),
          400,
        );
      }

      if (fallbackOrder.status !== "paid") {
        const { error: completeOrderError } = await adminClient.rpc(
          "complete_registry_order_payment",
          {
            p_order_id: fallbackOrder.id,
            p_paystack_reference: reference,
          },
        );

        if (completeOrderError) {
          return jsonError(
            getErrorMessage(completeOrderError, "Registry checkout could not be finalized."),
            400,
          );
        }
      }

      revalidateTag("registries", "max");

      return NextResponse.json({
        checkout: {
          checkout_type:
            fallbackOrder.contribution_type === "cash" ? "cash" : "item",
          paystack_reference: reference,
          registry_contribution_id: null,
          registry_id: fallbackOrder.registry_id,
          registry_order_id: fallbackOrder.id,
          status: "paid",
        },
        message: "Registry checkout verified successfully.",
        payment: {
          amountKobo: verifiedPayment.amount,
          paidAt: verifiedPayment.paid_at ?? null,
          reference: verifiedPayment.reference,
          type: metadataType,
        },
      });
    }

    return jsonError(
      getErrorMessage(error, "Registry checkout could not be finalized."),
      400,
    );
  }

  try {
    const checkout = parseRegistryCheckoutCompletion(data);
    if (checkout.registry_id !== metadataRegistryId) {
      return jsonError("Verified payment metadata does not match this registry checkout.", 400);
    }

    if (checkout.checkout_type !== metadataType) {
      return jsonError("Verified payment metadata does not match this checkout type.", 400);
    }

    revalidateTag("registries", "max");

    return NextResponse.json({
      checkout,
      message: "Registry checkout verified successfully.",
      payment: {
        amountKobo: verifiedPayment.amount,
        paidAt: verifiedPayment.paid_at ?? null,
        reference: verifiedPayment.reference,
        type: metadataType,
      },
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Registry checkout could not be finalized."),
      500,
    );
  }
}

async function handleCancelCheckout(
  payload: CancelRegistryCheckoutPayload,
) {
  const reference = payload.reference?.trim() ?? "";
  if (!reference) {
    return jsonError("Paystack reference is required.", 400);
  }

  if (!hasSupabaseServiceRoleEnv) {
    return jsonError(
      "Add SUPABASE_SERVICE_ROLE_KEY before cancelling registry checkout.",
      500,
    );
  }

  const adminClient = createSupabaseServiceRoleClient();
  if (!adminClient) {
    return jsonError(
      "Add SUPABASE_SERVICE_ROLE_KEY before cancelling registry checkout.",
      500,
    );
  }

  const { data, error } = await adminClient.rpc("cancel_registry_checkout", {
    p_paystack_reference: reference,
  });

  if (error) {
    if (shouldFallbackRegistryCheckoutRpc(error, "cancel_registry_checkout")) {
      const { data: fallbackOrder, error: fallbackOrderError } = await adminClient
        .from("registry_orders")
        .select("id")
        .eq("paystack_reference", reference)
        .maybeSingle();

      if (fallbackOrderError || !fallbackOrder) {
        return jsonError(
          getErrorMessage(fallbackOrderError, "Registry checkout could not be cancelled."),
          400,
        );
      }

      const { error: cancelOrderError } = await adminClient.rpc("cancel_registry_order", {
        p_order_id: fallbackOrder.id,
      });

      if (cancelOrderError) {
        return jsonError(
          getErrorMessage(cancelOrderError, "Registry checkout could not be cancelled."),
          400,
        );
      }

      revalidateTag("registries", "max");

      return NextResponse.json({
        checkout: {
          paystack_reference: reference,
          registry_order_id: fallbackOrder.id,
          status: "cancelled",
        },
        message: "Registry checkout cancelled.",
      });
    }

    return jsonError(
      getErrorMessage(error, "Registry checkout could not be cancelled."),
      400,
    );
  }

  revalidateTag("registries", "max");

  return NextResponse.json({
    checkout: isRecord(data) ? data : null,
    message: "Registry checkout cancelled.",
  });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as RegistryCheckoutPayload | null;

  if (!payload || !("action" in payload)) {
    return jsonError("Invalid registry checkout request.", 400);
  }

  if (payload.action === "initiate") {
    return handleInitiateCheckout(payload);
  }

  if (payload.action === "verify") {
    return handleVerifyCheckout(payload);
  }

  if (payload.action === "cancel") {
    return handleCancelCheckout(payload);
  }

  return jsonError("Unsupported registry checkout action.", 400);
}
