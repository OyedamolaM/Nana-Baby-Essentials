"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";
import { loadPaystackScript } from "../../lib/loadPaystack";
import { formatNairaAmount, toNairaAmount } from "../../../lib/commerce";
import { normalizeShippingAddress } from "../../../lib/userProfile";
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

type ShippingTierOption = {
  description?: string | null;
  eta?: string | null;
  fee: number;
  fulfillmentType: "delivery" | "pickup";
  label: string;
  value: string;
};

export function CheckoutModal({
  open,
  onClose,
  cartItems,
  onCheckoutComplete,
}: CheckoutModalProps) {
  const { profile, refreshProfile, session, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [paystackActive, setPaystackActive] = useState(false);
  const [shippingTier, setShippingTier] = useState("");
  const [shippingTiers, setShippingTiers] = useState<ShippingTierOption[]>([]);
  const [shippingTierLoading, setShippingTierLoading] = useState(false);
  const [shippingTierError, setShippingTierError] = useState<string | null>(null);

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
    if (!open) {
      return;
    }

    const savedAddress = normalizeShippingAddress(profile?.shipping_address);
    const frameId = window.requestAnimationFrame(() => {
      setShippingName(savedAddress.name || profile?.full_name || "");
      setShippingPhone(savedAddress.phone || profile?.phone || "");
      setShippingAddress(savedAddress.address);
      setShippingCity(savedAddress.city);
      setShippingState(savedAddress.state);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [open, profile]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!hasSupabaseEnv) {
      const frameId = window.requestAnimationFrame(() => {
        setShippingTiers([]);
        setShippingTier("");
        setShippingTierLoading(false);
        setShippingTierError(
          "Shipping tiers are not configured yet. Please contact support before checkout.",
        );
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    let cancelled = false;

    const loadShippingTiers = async () => {
      setShippingTierLoading(true);
      setShippingTierError(null);

      const { data, error } = await supabase
        .from("shipping_tiers")
        .select("code, label, fee, eta, description, fulfillment_type")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error || !data || data.length === 0) {
        if (!cancelled) {
          setShippingTiers([]);
          setShippingTier("");
          setShippingTierError(
            "Shipping tiers are not configured yet. Please contact support before checkout.",
          );
          setShippingTierLoading(false);
        }
        return;
      }

      const nextTiers = data.map((tier) => ({
        value: tier.code,
        label: tier.eta?.trim() ? `${tier.label} (${tier.eta})` : tier.label,
        fee: Number(tier.fee ?? 0),
        eta: tier.eta,
        description: tier.description,
        fulfillmentType: tier.fulfillment_type === "pickup" ? "pickup" : "delivery",
      })) satisfies ShippingTierOption[];

      if (!cancelled) {
        setShippingTiers(nextTiers);
        setShippingTier((currentTier) => {
          return nextTiers.some((tier) => tier.value === currentTier)
            ? currentTier
            : (nextTiers[0]?.value ?? "");
        });
        setShippingTierLoading(false);
      }
    };

    void loadShippingTiers();

    return () => {
      cancelled = true;
    };
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
    () => shippingTiers.find((tier) => tier.value === shippingTier),
    [shippingTier, shippingTiers],
  );

  const subtotalAmount = cartItems.reduce(
    (sum, item) => sum + toNairaAmount(item.price) * item.quantity,
    0,
  );
  const shippingFee = selectedTier?.fee ?? 0;
  const totalAmount = subtotalAmount + shippingFee;
  const preventModalClose = loading || paystackActive;
  const isPickupOrder = selectedTier?.fulfillmentType === "pickup";

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

    if (shippingTierLoading) {
      toast.info("Shipping tiers are still loading.");
      return;
    }

    if (!selectedTier) {
      toast.error(
        shippingTierError ??
          "Shipping tiers are not configured yet. Please contact support before checkout.",
      );
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
      void refreshProfile();

      const onPaymentSuccess = async (response: { reference: string }) => {
        if (!session?.access_token) {
          throw new Error("Please sign in again before finalizing this order.");
        }

        const paymentResponse = await fetch("/api/orders/complete", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderId,
            paystackReference: response.reference,
          }),
        });

        if (!paymentResponse.ok) {
          const payload = (await paymentResponse.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(
            payload?.message?.trim() ||
              "We could not finalize your order after payment.",
          );
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
            if (session?.access_token) {
              await fetch("/api/orders/cancel", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  orderId: pendingOrderId,
                }),
              }).catch(() => null);
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

          {/* {paystackActive ? (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
              Paystack is open in front of this form. If you cancel payment, your
              checkout details will stay here so you can try again.
            </div>
          ) : null} */}

          <div className="space-y-2">
            <Label>Shipping Zone</Label>
            {shippingTiers.length > 0 ? (
              <>
                <Select
                  value={shippingTier}
                  onValueChange={setShippingTier}
                  disabled={shippingTierLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        shippingTierLoading
                          ? "Loading shipping tiers..."
                          : "Select shipping tier"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {shippingTiers.map((tier) => (
                      <SelectItem key={tier.value} value={tier.value}>
                        {tier.label} - {formatNairaAmount(tier.fee)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTier?.description ? (
                  <p className="text-sm text-gray-500">{selectedTier.description}</p>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {shippingTierError ??
                  "Shipping tiers are not available yet. Please contact support before checkout."}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">
              {isPickupOrder ? "Pickup Contact Details" : "Shipping Address"}
            </h3>
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
                {/* {!profile?.phone?.trim() ? (
                  <p className="text-xs text-gray-500">
                    We&apos;ll save this number to your account when you continue with checkout.
                  </p>
                ) : null} */}
              </div>
            </div>

            {!isPickupOrder && (
              <>
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
              </>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={
              loading ||
              cartItems.length === 0 ||
              shippingTierLoading ||
              !selectedTier
            }
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
