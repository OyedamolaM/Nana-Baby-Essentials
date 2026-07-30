"use client";

import { Mail, MessageCircle, Phone, RefreshCw, ShoppingCart } from "lucide-react";

import { formatNaira } from "../../../lib/commerce";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export type AdminAbandonedCart = {
  createdAt: string;
  customer: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  };
  id: string;
  items: Array<{
    color?: string | null;
    name: string;
    productId?: number | null;
    quantity: number;
    size?: string | null;
    unitPrice: number;
    variantId?: string | null;
  }>;
  updatedAt: string;
  userId: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getWhatsAppUrl(phone?: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (!digits) return null;

  const internationalNumber = digits.startsWith("0")
    ? `234${digits.slice(1)}`
    : digits;
  return `https://wa.me/${internationalNumber}`;
}

export function AdminAbandonedCartsManager({
  abandonedAfterMinutes,
  carts,
  loading,
  onRefresh,
}: {
  abandonedAfterMinutes: number;
  carts: AdminAbandonedCart[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Abandoned Carts</CardTitle>
          <p className="text-sm text-gray-500">
            Non-empty carts from signed-in customers with no activity for at least{" "}
            {abandonedAfterMinutes} minutes.
          </p>
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && carts.length === 0 ? (
          <p className="text-sm text-gray-500">Loading abandoned carts...</p>
        ) : carts.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-gray-500">
            <ShoppingCart className="mx-auto mb-3 h-8 w-8" />
            No abandoned carts currently need follow-up.
          </div>
        ) : (
          <div className="space-y-4">
            {carts.map((cart) => {
              const total = cart.items.reduce(
                (sum, item) => sum + item.unitPrice * item.quantity,
                0,
              );
              const whatsappUrl = getWhatsAppUrl(cart.customer.phone);

              return (
                <div key={cart.id} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-semibold">
                        {cart.customer.name?.trim() || "Customer"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Last activity: {formatDateTime(cart.updatedAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {cart.customer.email ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={`mailto:${cart.customer.email}`}>
                              <Mail className="mr-2 h-4 w-4" />
                              Email
                            </a>
                          </Button>
                        ) : null}
                        {cart.customer.phone ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={`tel:${cart.customer.phone}`}>
                              <Phone className="mr-2 h-4 w-4" />
                              Call
                            </a>
                          </Button>
                        ) : null}
                        {whatsappUrl ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={whatsappUrl} target="_blank" rel="noreferrer">
                              <MessageCircle className="mr-2 h-4 w-4" />
                              WhatsApp
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-left lg:text-right">
                      <p className="text-sm text-gray-500">
                        {cart.items.length} distinct item
                        {cart.items.length === 1 ? "" : "s"}
                      </p>
                      <p className="text-lg font-bold">{formatNaira(total)}</p>
                    </div>
                  </div>

                  <div className="mt-4 divide-y rounded-xl bg-gray-50 px-4">
                    {cart.items.map((item) => {
                      const variant = [item.size, item.color].filter(Boolean).join(" / ");
                      return (
                        <div
                          key={`${item.productId ?? item.name}:${item.variantId ?? "base"}`}
                          className="flex items-start justify-between gap-4 py-3 text-sm"
                        >
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {variant ? (
                              <p className="text-xs text-gray-500">{variant}</p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <p>
                              {item.quantity} × {formatNaira(item.unitPrice)}
                            </p>
                            <p className="font-medium">
                              {formatNaira(item.unitPrice * item.quantity)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
