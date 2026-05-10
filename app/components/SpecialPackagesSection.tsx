"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Gift, ShoppingCart, Sparkles } from "lucide-react";

import { formatNaira } from "../../lib/commerce";
import {
  buildSpecialPackageTypeLabel,
  type SpecialPackage,
} from "../../lib/specialPackages";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./ui/carousel";
import { SpecialPackageDetailModal } from "./SpecialPackageDetailModal";

interface SpecialPackagesSectionProps {
  actionLabel: string;
  giftBundles?: SpecialPackage[];
  onAction: (pkg: SpecialPackage, quantity?: number) => void;
  sectionId?: string;
  swoopPackages?: SpecialPackage[];
}

function PackageCarousel({
  actionLabel,
  items,
  onAction,
  onViewDetails,
  title,
}: {
  actionLabel: string;
  items: SpecialPackage[];
  onAction: (pkg: SpecialPackage) => void;
  onViewDetails: (pkg: SpecialPackage) => void;
  title: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 text-center">
        <Sparkles className="h-5 w-5 text-pink-600" />
        <h3 className="text-2xl font-bold text-gray-900 sm:text-3xl">{title}</h3>
      </div>

      <Carousel className="px-1 sm:px-0" opts={{ loop: items.length > 1 }}>
        <CarouselContent>
          {items.map((pkg) => (
            <CarouselItem key={pkg.id}>
              <Card className="overflow-hidden rounded-[28px] border border-pink-100 shadow-sm">
                <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-4">
                    <div className="relative overflow-hidden rounded-[24px] bg-gray-50">
                      <img
                        src={pkg.image}
                        alt={pkg.title}
                        className="h-64 w-full object-cover sm:h-80"
                      />
                      <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                        <Badge>{pkg.badgeText}</Badge>
                        <Badge variant="secondary">
                          {buildSpecialPackageTypeLabel(pkg.packageType)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center space-y-4">
                    <div>
                      <h4 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                        {pkg.title}
                      </h4>
                      <p className="mt-2 text-sm leading-relaxed text-gray-600 sm:text-base">
                        {pkg.subtitle}
                      </p>
                      <p className="mt-4 text-3xl font-bold text-pink-600">
                        {formatNaira(pkg.product.price)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-pink-50 p-4 text-sm leading-relaxed text-gray-700">
                      <p className="font-medium text-pink-700">What&apos;s inside</p>
                      <p className="mt-2 line-clamp-4 whitespace-pre-line">{pkg.details}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="button" className="flex-1" onClick={() => onAction(pkg)}>
                        {actionLabel.toLowerCase().includes("registry") ? (
                          <Gift className="mr-2 h-4 w-4" />
                        ) : (
                          <ShoppingCart className="mr-2 h-4 w-4" />
                        )}
                        {actionLabel}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => onViewDetails(pkg)}>
                        Details
                      </Button>
                      {pkg.externalVideoUrl ? (
                        <Button asChild type="button" variant="ghost">
                          <a href={pkg.externalVideoUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Video
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>

        {items.length > 1 ? (
          <>
            <CarouselPrevious className="-left-3 size-8 border-pink-200 text-pink-700 sm:-left-5 sm:size-10 md:-left-12" />
            <CarouselNext className="-right-3 size-8 border-pink-200 text-pink-700 sm:-right-5 sm:size-10 md:-right-12" />
          </>
        ) : null}
      </Carousel>
    </div>
  );
}

export function SpecialPackagesSection({
  actionLabel,
  giftBundles = [],
  onAction,
  sectionId = "special-packages",
  swoopPackages = [],
}: SpecialPackagesSectionProps) {
  const [selectedPackage, setSelectedPackage] = useState<SpecialPackage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const visibleGiftBundles = useMemo(
    () => giftBundles.filter((pkg) => pkg.isActive),
    [giftBundles],
  );
  const visibleSwoopPackages = useMemo(
    () => swoopPackages.filter((pkg) => pkg.isActive),
    [swoopPackages],
  );

  if (visibleGiftBundles.length === 0 && visibleSwoopPackages.length === 0) {
    return null;
  }

  const handleViewDetails = (pkg: SpecialPackage) => {
    setSelectedPackage(pkg);
    setDetailsOpen(true);
  };

  return (
    <>
      <section
        id={sectionId}
        className="bg-gradient-to-b from-rose-50 via-white to-orange-50 py-16"
      >
        <div className="w-full px-3 sm:px-4">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-pink-600">
              Special Packages
            </p>
            <h2 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
              Curated baby bundles ready for gifting or checkout
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 sm:text-base">
              Explore complete bundles and larger newborn packages, open the details,
              watch the full video tour where available, and add them directly.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-6xl space-y-10 sm:px-6 md:px-10">
            {visibleSwoopPackages.length > 0 ? (
              <PackageCarousel
                actionLabel={actionLabel}
                items={visibleSwoopPackages}
                onAction={(pkg) => onAction(pkg)}
                onViewDetails={handleViewDetails}
                title="Swoop Packages"
              />
            ) : null}

            {visibleGiftBundles.length > 0 ? (
              <PackageCarousel
                actionLabel={actionLabel}
                items={visibleGiftBundles}
                onAction={(pkg) => onAction(pkg)}
                onViewDetails={handleViewDetails}
                title="Gift Bundles"
              />
            ) : null}
          </div>
        </div>
      </section>

      <SpecialPackageDetailModal
        key={selectedPackage?.id ?? "special-package-detail"}
        actionLabel={actionLabel}
        onAction={(pkg, quantity) => {
          onAction(pkg, quantity);
          setDetailsOpen(false);
        }}
        onClose={() => setDetailsOpen(false)}
        open={detailsOpen}
        pkg={selectedPackage}
      />
    </>
  );
}
