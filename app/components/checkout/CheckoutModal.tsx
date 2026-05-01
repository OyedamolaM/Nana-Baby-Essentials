"use client";

import { useEffect, useMemo, useState } from "react";
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [shippingTier, setShippingTier] = useState("lagos");

  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");

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

    try {
      const shippingAddressData = {
        name: shippingName,
        phone: shippingPhone,
        address: shippingAddress,
        city: shippingCity,
        state: shippingState,
      };

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          total: totalAmount,
          status: "pending",
          shipping_address: shippingAddressData,
          billing_address: shippingAddressData,
          items: cartItems.map((item) => ({
            product_id: item.id,
            name: item.name,
            price: toNairaAmount(item.price),
            quantity: item.quantity,
          })),
          shipping_tier: shippingTier,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const handler = window.PaystackPop.setup({
        key: paystackKey,
        email: user.email ?? shippingName,
        amount: totalAmount * 100,
        currency: "NGN",
        ref: `NBE-${order.id}-${Date.now()}`,
        metadata: {
          custom_fields: [
            {
              display_name: "Order ID",
              variable_name: "order_id",
              value: String(order.id),
            },
          ],
        },
        onClose: () => {
          toast.info("Payment cancelled.");
          setLoading(false);
        },
        callback: async (response: { reference: string }) => {
          await supabase
            .from("orders")
            .update({
              payment_reference: response.reference,
              status: "paid",
            })
            .eq("id", order.id);

          toast.success("Payment successful. Your order has been placed.");
          onCheckoutComplete();
          onClose();
          setLoading(false);
        },
      });

      handler.openIframe();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Checkout failed.";
      toast.error(message);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
            {loading
              ? "Processing..."
              : `Pay ${formatNairaAmount(totalAmount)} with Paystack`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
