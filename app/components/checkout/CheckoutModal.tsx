"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";
import { loadPaystackScript } from "../../lib/loadPaystack";
import { formatNairaAmount, toNairaAmount } from "../../../lib/commerce";
import { type Product } from "../ProductCard";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Separator } from "../ui/separator";

interface CartItem extends Product {
  quantity: number;
}

type PaystackHandler = {
  openIframe: () => void;
};

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onCheckoutComplete: () => void;
}

const SHIPPING_TIERS = [
  { value: "lagos", label: "Lagos (2-3 days)", fee: 2000 },
  { value: "southwest", label: "South West (3-5 days)", fee: 3500 },
  { value: "southeast", label: "South East (4-6 days)", fee: 4000 },
  { value: "northcentral", label: "North Central (4-6 days)", fee: 4500 },
  { value: "northeast", label: "North East (5-7 days)", fee: 5000 },
  { value: "northwest", label: "North West (5-7 days)", fee: 5000 },
  { value: "southsouth", label: "South South (4-6 days)", fee: 4000 },
];

export function CheckoutModal({
  open,
  onClose,
  cartItems,
  onCheckoutComplete,
}: CheckoutModalProps) {
  const { session, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [paystackActive, setPaystackActive] = useState(false);
  const [shippingTier, setShippingTier] = useState("lagos");

  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const activeOrderIdRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const pendingHandlerRef = useRef<PaystackHandler | null>(null);

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

  const selectedTier = useMemo(
    () => SHIPPING_TIERS.find((tier) => tier.value === shippingTier),
    [shippingTier],
  );

  const subtotalAmount = cartItems.reduce(
    (sum, item) => sum + toNairaAmount(item.price) * item.quantity,
    0,
  );
  const shippingFee = selectedTier?.fee ?? 0;
  const totalAmount = subtotalAmount + shippingFee;
  const preventModalClose = loading || paystackActive;

  const handleCheckout = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) {
      toast.error("Please sign in to checkout.");
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
      const shippingAddressData = {
        name: shippingName,
        phone: shippingPhone,
        address: shippingAddress,
        city: shippingCity,
        state: shippingState,
      };

      const orderItems = cartItems.map((item) => ({
        product_id: item.id,
        name: item.name,
        price: toNairaAmount(item.price),
        quantity: item.quantity,
      }));

      const { data: orderId, error } = await supabase.rpc(
        "create_store_order",
        {
          p_total: totalAmount,
          p_shipping_address: shippingAddressData,
          p_billing_address: shippingAddressData,
          p_items: orderItems,
          p_shipping_tier: shippingTier,
        },
      );

      if (error || !orderId) {
        throw error ?? new Error("Failed to start checkout.");
      }

      activeOrderIdRef.current = orderId;

      const onPaymentSuccess = async (response: { reference: string }) => {
        const { error: paymentError } = await supabase.rpc(
          "complete_store_order_payment",
          {
            p_order_id: orderId,
            p_paystack_reference: response.reference,
          },
        );

        if (paymentError) {
          throw paymentError;
        }

        let successMessage = "Payment successful. Your order has been placed.";

        if (!session?.access_token) {
          successMessage =
            "Payment successful. Your order has been placed, but we could not open an authenticated session to send your confirmation email.";
        } else {
          const emailResponse = await fetch("/api/orders/confirmation", {
            body: JSON.stringify({ orderId }),
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            method: "POST",
          });

          if (emailResponse.ok) {
            const payload = (await emailResponse.json().catch(() => null)) as
              | { sandbox?: boolean }
              | null;

            successMessage = payload?.sandbox
              ? "Payment successful. Your order has been placed and Brevo sandbox accepted the confirmation email request."
              : "Payment successful. Your order has been placed and your confirmation email is on the way.";
          } else {
            const payload = (await emailResponse.json().catch(() => null)) as
              | { message?: string }
              | null;

            successMessage =
              payload?.message?.trim() ||
              "Payment successful. Your order has been placed, but the confirmation email could not be sent yet.";
          }
        }

        activeOrderIdRef.current = null;
        setPaystackActive(false);
        toast.success(successMessage);
        onCheckoutComplete();
        onClose();
      };

      const handler = window.PaystackPop.setup({
        key: paystackKey,
        email: user.email || shippingName,
        amount: Math.round(totalAmount * 100),
        currency: "NGN",
        ref: `NBE-${orderId}-${Date.now()}`,
        metadata: {
          custom_fields: [
            {
              display_name: "Order ID",
              variable_name: "order_id",
              value: String(orderId),
            },
          ],
        },
        onClose: function() {
          if (completedRef.current || !activeOrderIdRef.current) {
            setPaystackActive(false);
            setLoading(false);
            return;
          }

          const pendingOrderId = activeOrderIdRef.current;

          void (async () => {
            const { error: cancelError } = await supabase.rpc(
              "cancel_store_order",
              {
                p_order_id: pendingOrderId,
              },
            );

            if (cancelError) {
              console.error("Failed to cancel store order", cancelError);
            }

            activeOrderIdRef.current = null;
            setPaystackActive(false);
            toast.info("Payment cancelled. Your checkout details are still here.");
            setLoading(false);
          })();
        },
        callback: function(response: { reference: string }) {
          completedRef.current = true;
          void onPaymentSuccess(response)
            .catch((error) => {
              activeOrderIdRef.current = null;
              setPaystackActive(false);
              const message =
                error instanceof Error
                  ? error.message
                  : "We could not finalize your order after payment.";

              toast.error(
                `Payment received, but we could not finish your order. Please contact support with reference ${response.reference}. ${message}`,
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
        error instanceof Error ? error.message : "Checkout failed.";
      toast.error(message);
      activeOrderIdRef.current = null;
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
          <DialogTitle>Checkout</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCheckout} className="space-y-6">
          <div className="space-y-2 rounded-lg bg-gray-50 p-4">
            <h3 className="mb-2 font-semibold">Order Summary</h3>
            {cartItems.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.name} x {item.quantity}
                </span>
                <span>
                  {formatNairaAmount(toNairaAmount(item.price) * item.quantity)}
                </span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatNairaAmount(subtotalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Shipping</span>
              <span>{formatNairaAmount(shippingFee)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatNairaAmount(totalAmount)}</span>
            </div>
          </div>

          {paystackActive ? (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
              Paystack is open in front of this form. If you cancel payment, your
              checkout details will stay here so you can try again.
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Shipping Zone</Label>
            <Select value={shippingTier} onValueChange={setShippingTier}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIPPING_TIERS.map((tier) => (
                  <SelectItem key={tier.value} value={tier.value}>
                    {tier.label} - {formatNairaAmount(tier.fee)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Shipping Address</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shipping-name">Full Name</Label>
                <Input
                  id="shipping-name"
                  value={shippingName}
                  onChange={(event) => setShippingName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shipping-phone">Phone</Label>
                <Input
                  id="shipping-phone"
                  type="tel"
                  value={shippingPhone}
                  onChange={(event) => setShippingPhone(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shipping-address">Street Address</Label>
              <Input
                id="shipping-address"
                value={shippingAddress}
                onChange={(event) => setShippingAddress(event.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shipping-city">City</Label>
                <Input
                  id="shipping-city"
                  value={shippingCity}
                  onChange={(event) => setShippingCity(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shipping-state">State</Label>
                <Input
                  id="shipping-state"
                  value={shippingState}
                  onChange={(event) => setShippingState(event.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={loading || cartItems.length === 0}
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
