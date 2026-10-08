import { createSupabaseServiceRoleClient } from "./supabaseServer";
import { schedulePaymentEmails } from "./paymentEmails";
import { getPaystackMetadataValue, matchesPaystackOrderAmount, verifyPaystackTransaction } from "./paystackServer";

export async function completeVerifiedRegistryDeliveryGift(payment: Awaited<ReturnType<typeof verifyPaystackTransaction>>) {
  const client = createSupabaseServiceRoleClient();
  if (!client) throw new Error("Delivery gifting is unavailable.");
  const giftId = getPaystackMetadataValue(payment.metadata, "registry_delivery_gift_id");
  const { data: gift, error } = await client.from("registry_delivery_gifts").select("id,registry_id,amount,payment_reference").eq("id", giftId).eq("payment_reference", payment.reference).maybeSingle();
  if (error || !gift || payment.status !== "success" || payment.currency !== "NGN" || !matchesPaystackOrderAmount(payment, gift.amount) || getPaystackMetadataValue(payment.metadata, "registry_id") !== gift.registry_id) throw new Error("This payment does not match the delivery gift.");
  const result = await client.rpc("complete_registry_delivery_gift", { p_reference: gift.payment_reference, p_paid_amount_kobo: Math.round(Number(gift.amount) * 100) });
  if (result.error) throw new Error("Could not complete the delivery gift.");
  schedulePaymentEmails(payment.reference);
}
