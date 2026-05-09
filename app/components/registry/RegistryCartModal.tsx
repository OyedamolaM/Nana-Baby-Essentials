"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { formatNaira } from "../../../lib/commerce";
import { type RegistryCartItem } from "../../../lib/registryCart";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type RegistrySummary = {
  id: string;
  name: string;
};

interface RegistryCartModalProps {
  isAuthenticated: boolean;
  items: RegistryCartItem[];
  onAddToExisting: (registryId: string) => void;
  onClose: () => void;
  onCreateNew: () => void;
  onOpenChange: (open: boolean) => void;
  onRemoveItem: (productId: number) => void;
  onRequireAuth: () => void;
  onUpdateQuantity: (productId: number, quantity: number) => void;
  open: boolean;
  registries: RegistrySummary[];
}

export function RegistryCartModal({
  isAuthenticated,
  items,
  onAddToExisting,
  onClose,
  onCreateNew,
  onOpenChange,
  onRemoveItem,
  onRequireAuth,
  onUpdateQuantity,
  open,
  registries,
}: RegistryCartModalProps) {
  const [selectedRegistryId, setSelectedRegistryId] = useState("");

  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );
  const hasRegistries = registries.length > 0;
  const canChooseDirectRegistry = registries.length === 1;
  const resolvedRegistryId = canChooseDirectRegistry
    ? registries[0]?.id ?? ""
    : selectedRegistryId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registry Cart</DialogTitle>
          <DialogDescription>
            Review the items you want to add, then save them to your registry without
            reloading the page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-gray-500">
              Your registry cart is empty.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.product.id}
                className="rounded-2xl border border-gray-200 p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{item.product.name}</p>
                    <p className="text-sm text-gray-500">{item.product.category}</p>
                    <p className="mt-2 text-sm font-medium text-pink-600">
                      {formatNaira(item.product.price)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center gap-2 rounded-full border px-2 py-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="min-w-6 text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onRemoveItem(item.product.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
          {totalItems} item{totalItems === 1 ? "" : "s"} ready for your registry.
        </div>

        {!isAuthenticated ? (
          <Button type="button" className="w-full" onClick={onRequireAuth}>
            Sign In to Continue
          </Button>
        ) : (
          <div className="space-y-4">
            {hasRegistries ? (
              <div className="space-y-2">
                <Label htmlFor="existing-registry">Add to Registry</Label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {registries.length > 1 ? (
                    <Select value={selectedRegistryId} onValueChange={setSelectedRegistryId}>
                      <SelectTrigger id="existing-registry" className="sm:flex-1">
                        <SelectValue placeholder="Choose a registry" />
                      </SelectTrigger>
                      <SelectContent>
                        {registries.map((registry) => (
                          <SelectItem key={registry.id} value={registry.id}>
                            {registry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-md border px-3 py-2 text-sm text-gray-700 sm:flex-1">
                      {registries[0]?.name}
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={() => onAddToExisting(resolvedRegistryId)}
                    disabled={!resolvedRegistryId || items.length === 0}
                  >
                    Add to Registry
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                className="w-full"
                onClick={onCreateNew}
                disabled={items.length === 0}
              >
                Create New Registry
              </Button>
            )}
          </div>
        )}

        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
