'use client'

import { Trash2, ShoppingBag } from "lucide-react";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Separator } from "./ui/separator";
import {
  getStoreCartItemKey,
  type StoreCartItem,
} from "../contexts/StoreCartContext";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { formatNaira, formatNairaAmount, toNairaAmount } from "../../lib/commerce";
import { Input } from "./ui/input";

type CartItem = StoreCartItem;

interface ShoppingCartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartItems: CartItem[];
  onRemoveItem: (itemKey: string) => void;
  onUpdateQuantity: (itemKey: string, quantity: number) => void;
  onCheckout: () => void;
}

export function ShoppingCartDrawer({
  open,
  onOpenChange,
  cartItems,
  onRemoveItem,
  onUpdateQuantity,
  onCheckout,
}: ShoppingCartDrawerProps) {
  const total = cartItems.reduce(
    (sum, item) => sum + toNairaAmount(item.price) * item.quantity,
    0,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Shopping Cart
          </SheetTitle>
          <SheetDescription>
            Review the items you have selected before continuing to checkout.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <ShoppingBag className="h-16 w-16 mb-4 opacity-20" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cartItems.map((item) => {
                const itemKey = getStoreCartItemKey(item);
                const optionLabel = [item.size, item.color].filter(Boolean).join(" / ");

                return (
                <div
                  key={itemKey}
                  className="flex gap-4 rounded-2xl border border-gray-200 p-4"
                >
                  <ImageWithFallback
                    src={item.image}
                    alt={item.name}
                    className="h-20 w-20 rounded object-cover"
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{item.name}</h4>
                    <p className="text-sm text-gray-600">{formatNaira(item.price)}</p>
                    {optionLabel ? (
                      <p className="mt-0.5 text-xs text-gray-500">{optionLabel}</p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => onUpdateQuantity(itemKey, Math.max(1, item.quantity - 1))}
                        className="h-7 w-7 p-0"
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={item.quantity}
                        onChange={(event) => {
                          const nextValue = event.target.value.trim();
                          if (!nextValue) {
                            return;
                          }

                          const nextQuantity = Math.floor(Number(nextValue));
                          if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
                            return;
                          }

                          onUpdateQuantity(itemKey, nextQuantity);
                        }}
                        className="h-8 w-20 text-center"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => onUpdateQuantity(itemKey, item.quantity + 1)}
                        className="h-7 w-7 p-0"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => onRemoveItem(itemKey)}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {cartItems.length > 0 && (
          <>
            <Separator />
            <SheetFooter className="flex-col gap-4">
              <div className="flex justify-between items-center w-full">
                <span className="text-lg font-semibold">Total:</span>
                <span className="text-2xl font-bold">{formatNairaAmount(total)}</span>
              </div>
              <Button className="w-full" size="lg" type="button" onClick={onCheckout}>
                Checkout
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
