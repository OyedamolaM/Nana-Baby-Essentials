"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { loadPaystackScript } from "../../lib/loadPaystack";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Textarea } from "../ui/textarea";
import { formatNairaAmount, toNairaAmount } from "../../../lib/commerce";
import { getRemainingRegistryQuantity, type RegistryItem, type RegistryRecord } from "../../../lib/registry";

export interface RegistryGiftSelection {
  item: RegistryItem;
  quantity: number;
}

interface RegistryGiftCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  registry: RegistryRecord;
  selectedItems: RegistryGiftSelection[];
  customContributionAmount: number;
  onCheckoutComplete: () => void;
}

export function RegistryGiftCheckoutModal({
  open,
  onClose,
  registry,
  selectedItems,
  customContributionAmount,
  onCheckoutComplete,
}: RegistryGiftCheckoutModalProps) {
  const [loading, setLoading] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerMessage, setBuyerMessage] = useState("");
  const activeOrderIdRef = useRef<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadPaystackScript()
      .then(() => setPaystackLoaded(true))
      .catch(() => {
        setPaystackLoaded(false);
        toast.error("Failed to load Paystack.");
      });
  }, [open]);

  const itemsAmount = useMemo(() => {
    return selectedItems.reduce((sum, selection) => {
      return sum + toNairaAmount(selection.item.unitPriceSnapshot) * selection.quantity;
    }, 0);
  }, [selectedItems]);

  const totalAmount = itemsAmount + customContributionAmount;

  const contributionType = useMemo<"items" | "cash" | "mixed">(() => {
    if (selectedItems.length > 0 && customContributionAmount > 0) {
      return "mixed";
    }

    if (selectedItems.length > 0) {
      return "items";
    }

    return "cash";
  }, [customContributionAmount, selectedItems.length]);

  const handleCheckout = async (event: React.FormEvent) => {
    event.preventDefault();

    if (totalAmount <= 0) {
      toast.error("Select registry items or enter a contribution amount.");
      return;
    }

    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!paystackKey) {
      toast.error("Add NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY to enable payments.");
      return;
    }

    if (!paystackLoaded || !window.PaystackPop) {
      toast.error("Paystack is still loading. Please try again.");
      return;
    }

    setLoading(true);
    completedRef.current = false;

    try {
      const checkoutItems = selectedItems.map((selection) => ({
        registry_item_id: selection.item.id,
        quantity: selection.quantity,
      }));

      const { data: orderId, error: orderError } = await supabase.rpc(
        "create_registry_order",
        {
          p_registry_id: registry.id,
          p_buyer_name: buyerName,
          p_buyer_email: buyerEmail,
          p_buyer_phone: buyerPhone,
          p_buyer_message: buyerMessage,
          p_total: totalAmount,
          p_contribution_type: contributionType,
          p_selected_items: checkoutItems,
        },
      );

      if (orderError || !orderId) {
        throw orderError ?? new Error("Failed to start registry payment.");
      }

      activeOrderIdRef.current = orderId;

      const finalizePurchase = async (reference: string) => {
        const { error: finalizeError } = await supabase.rpc(
          "complete_registry_order_payment",
          {
            p_order_id: orderId,
            p_paystack_reference: reference,
          },
        );

        if (finalizeError) {
          throw finalizeError;
        }

        activeOrderIdRef.current = null;
        toast.success("Payment successful. Thank you for gifting!");
        onCheckoutComplete();
        onClose();
      };

      const handler = window.PaystackPop.setup({
        key: paystackKey,
        email: buyerEmail,
        amount: Math.round(totalAmount * 100),
        currency: "NGN",
        ref: `NBE-REG-${orderId}-${Date.now()}`,
        metadata: {
          custom_fields: [
            {
              display_name: "Registry",
              variable_name: "registry_name",
              value: registry.name,
            },
          ],
        },
        onClose: function() {
          if (completedRef.current || !activeOrderIdRef.current) {
            setLoading(false);
            return;
          }

          const orderId = activeOrderIdRef.current;

          void (async () => {
            const { error: cancelError } = await supabase.rpc(
              "cancel_registry_order",
              {
                p_order_id: orderId,
              },
            );

            if (cancelError) {
              console.error("Failed to cancel registry order", cancelError);
            }

            activeOrderIdRef.current = null;
            toast.info("Payment cancelled.");
            setLoading(false);
          })();
        },
        callback: function(response: { reference: string }) {
          completedRef.current = true;
          void finalizePurchase(response.reference)
            .catch((error) => {
              activeOrderIdRef.current = null;
              const message =
                error instanceof Error
                  ? error.message
                  : "We could not finalize this registry gift after payment.";

              toast.error(
                `Payment received, but we could not finish the registry gift. Please contact support with reference ${response.reference}. ${message}`,
              );
            })
            .finally(() => {
              setLoading(false);
            });
        },
      });

      handler.openIframe();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Registry checkout failed.";
      toast.error(message);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Your Gift</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCheckout} className="space-y-6">
          <div className="space-y-2 rounded-lg bg-gray-50 p-4">
            <h3 className="font-semibold">Gift Summary</h3>
            {selectedItems.length > 0 ? (
              selectedItems.map((selection) => (
                <div key={selection.item.id} className="flex justify-between text-sm">
                  <span>
                    {selection.item.product?.name ?? "Registry item"} x{" "}
                    {selection.quantity}
                  </span>
                  <span>
                    {formatNairaAmount(
                      toNairaAmount(selection.item.unitPriceSnapshot) *
                        selection.quantity,
                    )}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">
                No product gifts selected. You&apos;re making a cash contribution.
              </p>
            )}

            {customContributionAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span>Cash contribution</span>
                <span>{formatNairaAmount(customContributionAmount)}</span>
              </div>
            )}

            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatNairaAmount(totalAmount)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="buyer-name">Your Name</Label>
              <Input
                id="buyer-name"
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyer-email">Email</Label>
              <Input
                id="buyer-email"
                type="email"
                value={buyerEmail}
                onChange={(event) => setBuyerEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyer-phone">Phone</Label>
              <Input
                id="buyer-phone"
                type="tel"
                value={buyerPhone}
                onChange={(event) => setBuyerPhone(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyer-registry">Registry</Label>
              <Input id="buyer-registry" value={registry.name} disabled />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="buyer-message">Message (Optional)</Label>
            <Textarea
              id="buyer-message"
              value={buyerMessage}
              onChange={(event) => setBuyerMessage(event.target.value)}
              placeholder="Add a lovely note for the parent."
              rows={3}
            />
          </div>

          {selectedItems.length > 0 && (
            <div className="rounded-lg border border-pink-100 bg-pink-50 p-4 text-sm text-pink-900">
              <p className="font-semibold">Registry stock check</p>
              <ul className="mt-2 space-y-1">
                {selectedItems.map((selection) => (
                  <li key={selection.item.id}>
                    {selection.item.product?.name ?? "Registry item"}:{" "}
                    {getRemainingRegistryQuantity(selection.item)} remaining
                    before this payment.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={loading || totalAmount <= 0}
          >
            {loading
              ? "Processing..."
              : `Pay ${formatNairaAmount(totalAmount)} with Paystack`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
