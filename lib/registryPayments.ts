import "server-only";

import {
  getPaystackMetadataValue,
  matchesPaystackOrderAmount,
  type PaystackVerifiedTransaction,
} from "./paystackServer";
import { createSupabaseServiceRoleClient } from "./supabaseServer";

// Both the browser callback and the webhook must use the same confirmation path.
export async function completeVerifiedRegistryCheckout(payment: PaystackVerifiedTransaction) {
  const registryId = getPaystackMetadataValue(payment.metadata, "registry_id");
  const checkoutType = getPaystackMetadataValue(payment.metadata, "type");
  if (payment.status !== "success" || payment.currency !== "NGN" || !registryId ||
      (checkoutType !== "item" && checkoutType !== "cash")) {
    throw new Error("This payment does not match a successful NGN registry checkout.");
  }

  const client = createSupabaseServiceRoleClient();
  if (!client) throw new Error("Registry payment confirmation is unavailable.");

  const [orderResult, contributionResult] = await Promise.all([
    client.from("registry_orders")
      .select("id, registry_id, contribution_type, status, total_amount")
      .eq("paystack_reference", payment.reference).maybeSingle(),
    client.from("registry_contributions")
      .select("id, registry_id, status, amount")
      .eq("paystack_reference", payment.reference).maybeSingle(),
  ]);
  if (orderResult.error) throw new Error(orderResult.error.message);
  if (contributionResult.error) throw new Error(contributionResult.error.message);

  const order = orderResult.data;
  const contribution = contributionResult.data;
  const storedType = order && order.contribution_type !== "cash" ? "item" : "cash";
  if ((!order && !contribution) ||
      (order && order.registry_id !== registryId) ||
      (contribution && contribution.registry_id !== registryId) || storedType !== checkoutType) {
    throw new Error("Verified payment metadata does not match this registry checkout.");
  }

  const total = Number(order?.total_amount ?? 0) + Number(contribution?.amount ?? 0);
  if (total <= 0 || !matchesPaystackOrderAmount(payment, total)) {
    throw new Error("Verified payment amount does not match this registry checkout.");
  }

  const { data, error } = await client.rpc("complete_registry_checkout_payment", {
    // Credit the checkout total, excluding any fees added by Paystack.
    p_paid_amount_kobo: Math.round(total * 100),
    p_paystack_reference: payment.reference,
    p_paystack_transaction_id: payment.id,
  });
  if (!error) {
    if (!data || typeof data !== "object" || Array.isArray(data) ||
        data.status !== "paid" || data.registry_id !== registryId ||
        data.paystack_reference !== payment.reference || data.checkout_type !== checkoutType) {
      throw new Error("Registry checkout confirmation returned an invalid result.");
    }
    return data;
  }

  const missingFunction = error.code === "PGRST202" ||
    error.message?.includes("function public.complete_registry_checkout_payment") ||
    error.message?.includes("function min(uuid) does not exist");
  if (!missingFunction || !order || contribution) throw new Error(error.message);

  // Support older deployments that store the entire checkout in registry_orders.
  if (order.status !== "paid") {
    const result = await client.rpc("complete_registry_order_payment", {
      p_order_id: order.id,
      p_paystack_reference: payment.reference,
    });
    if (result.error) throw new Error(result.error.message);
  }
  return {
    checkout_type: storedType,
    paystack_reference: payment.reference,
    registry_contribution_id: null,
    registry_id: registryId,
    registry_order_id: order.id,
    status: "paid",
  };
}
