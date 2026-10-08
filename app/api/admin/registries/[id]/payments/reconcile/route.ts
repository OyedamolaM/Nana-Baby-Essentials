import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdminRoute } from "@/lib/authServer";
import { getPaystackMetadataValue, hasPaystackServerEnv, verifyPaystackTransaction } from "@/lib/paystackServer";
import { completeVerifiedRegistryCheckout } from "@/lib/registryPayments";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";
import { queueRecoveredPaymentEmails } from "@/lib/paymentEmails";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRoute(request);
  if (admin.response) return admin.response;

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const reference = body && typeof body === "object" && "reference" in body && typeof body.reference === "string"
    ? body.reference.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      !reference || reference.length > 100 || !/^[a-zA-Z0-9._=-]+$/.test(reference)) {
    return NextResponse.json({ message: "Enter a valid registry and Paystack reference." }, { status: 400 });
  }
  const client = createSupabaseServiceRoleClient();
  if (!client || !hasPaystackServerEnv) {
    return NextResponse.json({ message: "Payment recovery is unavailable." }, { status: 503 });
  }

  let payment;
  try {
    payment = await verifyPaystackTransaction(reference);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not verify this payment with Paystack." }, { status: 502 });
  }
  if (payment.reference !== reference || payment.status !== "success" || payment.currency !== "NGN" ||
      getPaystackMetadataValue(payment.metadata, "registry_id") !== id) {
    return NextResponse.json({ message: "This reference is not a successful NGN payment for this registry." }, { status: 400 });
  }

  let checkout;
  try {
    // The existing RPC checks the saved amount and locks the checkout records.
    // It also makes repeated recovery attempts safe for already recorded gifts.
    checkout = await completeVerifiedRegistryCheckout(payment, { recoverCancelled: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not record this registry payment." }, { status: 409 });
  }

  // Repair totals from the paid ledger if this payment was already marked paid
  // but its item funding was missing. Cash allocations are included as well.
  const rebuilt = await client.rpc("rebuild_registry_item_funding", { p_registry_id: id });
  revalidateTag("registries", { expire: 0 });
  if (rebuilt.error) {
    console.error("Registry payment recovery could not rebuild funding.", rebuilt.error);
    return NextResponse.json({ message: "Payment recorded, but registry funding could not be refreshed. Please contact support.", checkout }, { status: 500 });
  }
  // Already-paid records may predate the outbox. Only queue this reference.
  let emailQueued = true;
  await queueRecoveredPaymentEmails(reference).catch((error) => {
    emailQueued = false;
    console.error("Recovered payment email could not be queued.", error);
  });
  return NextResponse.json({ checkout, emailQueued, message: emailQueued
    ? "Payment verified and recorded. Confirmation emails queued."
    : "Payment verified and recorded, but confirmation emails could not be queued. Check this payment again." });
}
