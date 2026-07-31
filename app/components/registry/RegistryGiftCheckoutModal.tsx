"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { loadPaystackScript } from "../../lib/loadPaystack";
import { hasSupabaseEnv } from "../../lib/supabase";
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
import { formatNairaAmount } from "../../../lib/commerce";
import {
  getRegistryItemRemainingAmount,
  getRegistryItemSelectionAmount,
  getRemainingRegistryQuantity,
  type RegistryItem,
  type RegistryRecord,
} from "../../../lib/registry";

type PaystackHandler = {
  openIframe: () => void;
};

type RegistryCheckoutSession = {
  amountKobo: number;
  checkoutType: "item" | "cash";
  currency: string;
  metadata: Record<string, unknown>;
  reference: string;
};

export interface RegistryGiftSelection {
  item: RegistryItem;
  quantity: number;
}

interface RegistryGiftCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  registry: RegistryRecord;
  selectedItems: RegistryGiftSelection[];
  paymentAmount: number;
  onCheckoutComplete: () => void;
}

export function RegistryGiftCheckoutModal({
  open,
  onClose,
  registry,
  selectedItems,
  paymentAmount,
  onCheckoutComplete,
}: RegistryGiftCheckoutModalProps) {
  const [loading, setLoading] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [paystackActive, setPaystackActive] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerMessage, setBuyerMessage] = useState("");
  const activeReferenceRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const pendingHandlerRef = useRef<PaystackHandler | null>(null);

  const postRegistryCheckout = async <T,>(
    payload: Record<string, unknown>,
    fallbackMessage: string,
  ) => {
    const response = await fetch("/api/registry/checkout", {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | T
      | null;

    if (!response.ok) {
      const message =
        data &&
        typeof data === "object" &&
        "message" in data &&
        typeof data.message === "string" &&
        data.message.trim()
          ? data.message.trim()
          : fallbackMessage;

      throw new Error(message);
    }

    return data as T;
  };

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

  useEffect(() => {
    if (!paystackActive || !pendingHandlerRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      pendingHandlerRef.current?.openIframe();
      pendingHandlerRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [paystackActive]);

  const selectedItemsTargetAmount = useMemo(() => {
    return selectedItems.reduce((sum, selection) => {
      return sum + getRegistryItemSelectionAmount(selection.item, selection.quantity);
    }, 0);
  }, [selectedItems]);

  const totalAmount = paymentAmount;
  const preventModalClose = loading || paystackActive;

  const handleCheckout = async (event: React.FormEvent) => {
    event.preventDefault();

    if (totalAmount <= 0) {
      toast.error("Select registry items or enter a contribution amount.");
      return;
    }

    if (selectedItems.length > 0 && paymentAmount > selectedItemsTargetAmount) {
      toast.error(
        "This payment cannot be more than the selected item balance. Reduce the amount or remove some items first.",
      );
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

      const session = await postRegistryCheckout<RegistryCheckoutSession>(
        {
          action: "initiate",
          buyerEmail,
          buyerMessage,
          buyerName,
          buyerPhone,
          paymentAmount,
          registryId: registry.id,
          selectedItems: checkoutItems.map((item) => ({
            quantity: item.quantity,
            registryItemId: item.registry_item_id,
          })),
        },
        "Failed to start registry payment.",
      );

      activeReferenceRef.current = session.reference;

      const finalizePurchase = async (reference: string) => {
        await postRegistryCheckout(
          {
            action: "verify",
            reference,
          },
          "We could not finalize this registry gift after payment.",
        );

        activeReferenceRef.current = null;
        setPaystackActive(false);
        toast.success("Payment successful. Thank you for gifting!");
        onCheckoutComplete();
        onClose();
      };

      const handler = window.PaystackPop.setup({
        key: paystackKey,
        email: buyerEmail,
        amount: session.amountKobo,
        currency: session.currency,
        ref: session.reference,
        metadata: {
          ...session.metadata,
          custom_fields: [
            {
              display_name: "Registry",
              variable_name: "registry_name",
              value: registry.name,
            },
            {
              display_name: "Checkout Type",
              variable_name: "checkout_type",
              value: session.checkoutType,
            },
          ],
        },
        onClose: function() {
          if (completedRef.current || !activeReferenceRef.current) {
            setPaystackActive(false);
            setLoading(false);
            return;
          }

          const reference = activeReferenceRef.current;

          void (async () => {
            try {
              await postRegistryCheckout(
                {
                  action: "cancel",
                  reference,
                },
                "Failed to cancel registry checkout.",
              );
            } catch (error) {
              console.error("Failed to cancel registry checkout", error);
            }

            activeReferenceRef.current = null;
            setPaystackActive(false);
            toast.info("Payment cancelled. Your gift details are still here.");
            setLoading(false);
          })();
        },
        callback: function(response: { reference: string }) {
          completedRef.current = true;
          const verifiedReference = response.reference || activeReferenceRef.current;
          void finalizePurchase(verifiedReference ?? "")
            .catch((error) => {
              activeReferenceRef.current = null;
              setPaystackActive(false);
              const message =
                error instanceof Error
                  ? error.message
                  : "We could not finalize this registry gift after payment.";

              toast.error(
                `Payment received, but we could not finish the registry gift. Please contact support with reference ${response.reference}. ${message}`,
              );
              onCheckoutComplete();
              onClose();
            })
            .finally(() => {
              setLoading(false);
            });
        },
      });

      pendingHandlerRef.current = handler;
      setPaystackActive(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Registry checkout failed.";
      toast.error(message);
      activeReferenceRef.current = null;
      setPaystackActive(false);
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      modal={!paystackActive}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !preventModalClose) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        showCloseButton={!preventModalClose}
        onEscapeKeyDown={(event) => {
          if (preventModalClose) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (preventModalClose) {
            event.preventDefault();
          }
        }}
      >
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
                      getRegistryItemSelectionAmount(
                        selection.item,
                        selection.quantity,
                      ),
                    )}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">
                No product gifts selected. You&apos;re making a general registry cash gift.
              </p>
            )}

            {selectedItems.length > 0 ? (
              <div className="flex justify-between text-sm">
                <span>Selected item balance</span>
                <span>{formatNairaAmount(selectedItemsTargetAmount)}</span>
              </div>
            ) : null}

            <Separator />
            <div className="flex justify-between font-semibold">
              <span>You are paying now</span>
              <span>{formatNairaAmount(totalAmount)}</span>
            </div>
          </div>

          {/* {paystackActive ? (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
              Paystack is open in front of this form. If you cancel, your gift
              details will stay here so you can try again.
            </div>
          ) : null} */}

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
                required
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
              <p className="font-semibold">Selected item funding</p>
              <ul className="mt-2 space-y-1">
                {selectedItems.map((selection) => (
                  <li key={selection.item.id}>
                    {selection.item.product?.name ?? "Registry item"}:{" "}
                    {getRemainingRegistryQuantity(selection.item)} units still needed and{" "}
                    {formatNairaAmount(getRegistryItemRemainingAmount(selection.item))} left
                    before this payment.
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                Your payment can cover all or part of these selected items. If you
                pay less than the full selected balance, the amount will be applied
                across the selected items in the order you chose them.
              </p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={loading || totalAmount <= 0}
          >
            {paystackActive
              ? "Paystack checkout open..."
              : loading
                ? "Preparing secure checkout..."
                : `Pay ${formatNairaAmount(totalAmount)} with Paystack`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
