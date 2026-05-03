"use client";

import Link from "next/link";
import { Gift, Share2, Trash2 } from "lucide-react";
import { formatNairaAmount, toNairaAmount } from "../../../lib/commerce";
import {
  type RegistryItem,
  type RegistryRecord,
  getRemainingRegistryQuantity,
} from "../../../lib/registry";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "../ui/sheet";
import { Textarea } from "../ui/textarea";

interface RegistryBuilderDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registry: RegistryRecord | null;
  items: RegistryItem[];
  onRemoveItem: (registryItemId: string) => void;
  onUpdateQuantity: (registryItemId: string, quantity: number) => void;
  onUpdateNote: (registryItemId: string, note: string) => void;
  onShare: () => void;
}

export function RegistryBuilderDrawer({
  open,
  onOpenChange,
  registry,
  items,
  onRemoveItem,
  onUpdateNote,
  onUpdateQuantity,
  onShare,
}: RegistryBuilderDrawerProps) {
  const estimatedValue = items.reduce((sum, item) => {
    return sum + toNairaAmount(item.unitPriceSnapshot) * item.requestedQuantity;
  }, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Registry Builder
          </SheetTitle>
        </SheetHeader>

        {!registry ? (
          <div className="flex flex-1 items-center justify-center text-center text-gray-500">
            Create a registry first so you can start building your gift list.
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-pink-100 bg-pink-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-500">
                Active Registry
              </p>
              <p className="mt-2 text-lg font-bold text-gray-900">
                {registry.name}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {items.length} distinct items and an estimated value of{" "}
                {formatNairaAmount(estimatedValue)}.
              </p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto py-4">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
                  <Gift className="mb-4 h-16 w-16 opacity-20" />
                  <p>No products in this registry yet.</p>
                </div>
              ) : (
                items.map((item) => {
                  const remainingQuantity = getRemainingRegistryQuantity(item);

                  return (
                    <div key={item.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {item.product?.name ?? "Registry Item"}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Requested {item.requestedQuantity}, purchased{" "}
                            {item.purchasedQuantity}, remaining {remainingQuantity}
                          </p>
                          <p className="mt-1 text-sm font-medium text-pink-600">
                            {formatNairaAmount(
                              toNairaAmount(item.unitPriceSnapshot) *
                                item.requestedQuantity,
                            )}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onUpdateQuantity(item.id, Math.max(1, item.requestedQuantity - 1))
                          }
                        >
                          -
                        </Button>
                        <span className="min-w-10 text-center text-sm font-medium">
                          {item.requestedQuantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onUpdateQuantity(item.id, item.requestedQuantity + 1)
                          }
                        >
                          +
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                          Note for guests
                        </label>
                        <Textarea
                          value={item.note}
                          onChange={(event) =>
                            onUpdateNote(item.id, event.target.value)
                          }
                          placeholder="Share a color preference, size note, or why this item matters."
                          rows={3}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <SheetFooter className="flex-col gap-3">
              <Button type="button" className="w-full" onClick={onShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Share Registry Link
              </Button>
              {registry && (
                <Button type="button" variant="outline" asChild className="w-full">
                  <Link href={`/registry/${registry.share_code}`}>
                    Preview Public Registry
                  </Link>
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
