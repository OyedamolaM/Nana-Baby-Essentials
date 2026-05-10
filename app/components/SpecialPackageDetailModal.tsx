"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Gift, ShoppingCart } from "lucide-react";

import { formatNaira } from "../../lib/commerce";
import {
  buildSpecialPackageTypeLabel,
  splitPackageDetails,
  type SpecialPackage,
} from "../../lib/specialPackages";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface SpecialPackageDetailModalProps {
  actionLabel: string;
  onAction: (pkg: SpecialPackage, quantity?: number) => void;
  onClose: () => void;
  open: boolean;
  pkg: SpecialPackage | null;
}

export function SpecialPackageDetailModal({
  actionLabel,
  onAction,
  onClose,
  open,
  pkg,
}: SpecialPackageDetailModalProps) {
  const [quantity, setQuantity] = useState(1);

  const detailItems = useMemo(() => splitPackageDetails(pkg?.details), [pkg?.details]);

  if (!pkg) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>{pkg.title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <img
              src={pkg.image}
              alt={pkg.title}
              className="aspect-square w-full rounded-3xl object-cover"
            />
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{buildSpecialPackageTypeLabel(pkg.packageType)}</Badge>
                <Badge>{pkg.badgeText}</Badge>
              </div>
              <h2 className="text-3xl font-bold text-gray-900">{pkg.title}</h2>
              <p className="mt-2 text-base text-gray-600">{pkg.subtitle}</p>
              <p className="mt-4 text-3xl font-bold text-pink-600">
                {formatNaira(pkg.product.price)}
              </p>
            </div>

            <div className="rounded-2xl bg-pink-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-pink-700">
                Package Details
              </h3>
              {detailItems.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gray-700">
                  {detailItems.map((item) => (
                    <li key={`${pkg.id}-${item}`} className="flex gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-pink-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-gray-700">{pkg.details}</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="font-semibold text-gray-900">Quantity:</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  >
                    -
                  </Button>
                  <span className="w-12 text-center">{quantity}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuantity((current) => current + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" className="flex-1" onClick={() => onAction(pkg, quantity)}>
                  {actionLabel.toLowerCase().includes("registry") ? (
                    <Gift className="mr-2 h-4 w-4" />
                  ) : (
                    <ShoppingCart className="mr-2 h-4 w-4" />
                  )}
                  {actionLabel}
                </Button>

                {pkg.externalVideoUrl ? (
                  <Button asChild type="button" variant="outline" className="flex-1">
                    <a href={pkg.externalVideoUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Watch Video
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
