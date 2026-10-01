"use client";

import { getSelectionGallery, getSelectedColour, getStockLimit, isColourOption, isItemAvailable } from "../../../lib/productOptions";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  HeartHandshake,
  ShoppingCart,
  Share2,
} from "lucide-react";
import { toast } from "sonner";

import {
  type StoreProduct,
  formatNaira,
  getVariantOptions,
} from "../../../lib/commerce";
import { readProductDetailReturnContext } from "../../../lib/productDetailReturn";
import { getFullProductImageUrl } from "../../../lib/storefrontProductImage";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ImageWithFallback } from "../../components/figma/ImageWithFallback";
import { useStoreCart } from "../../contexts/StoreCartContext";

export function ProductDetailPageClient({
  product,
}: {
  product: StoreProduct;
}) {
  const router = useRouter();
  const { addItem } = useStoreCart();
  const baseGalleryImages = useMemo(
    () => (product.images ?? []).filter((image) => image.url.trim()),
    [product.images],
  );
  const allProductVariants = useMemo(() => product.variants ?? [], [product.variants]);
  const productVariants = useMemo(
    () => allProductVariants.filter(isItemAvailable),
    [allProductVariants],
  );
  const hasVariantChoices = Boolean(product.hasVariants);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const touchStartXRef = useRef<number | null>(null);

  const optionGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const variant of allProductVariants) {
      for (const [label, value] of Object.entries(getVariantOptions(variant))) {
        groups.set(label, Array.from(new Set([...(groups.get(label) ?? []), value])));
      }
    }
    return Array.from(groups.entries());
  }, [allProductVariants]);

  const selectedVariant = useMemo(() => {
    if (!hasVariantChoices || productVariants.length === 0) {
      return undefined;
    }

    if (optionGroups.some(([label]) => !selectedOptions[label])) {
      return undefined;
    }

    return productVariants.find((variant) =>
      optionGroups.every(
        ([label]) => getVariantOptions(variant)[label] === selectedOptions[label],
      ),
    );
  }, [hasVariantChoices, optionGroups, productVariants, selectedOptions]);

  const selectedColour = getSelectedColour(selectedOptions);
  const selectionGallery = getSelectionGallery(product.colourImages ?? [], selectedOptions, selectedVariant);
  const galleryImages = selectionGallery.length ? selectionGallery : baseGalleryImages;

  // Jump back to the first photo whenever the chosen variant changes.
  useEffect(() => {
    const resetIndex = window.setTimeout(() => {
      setSelectedImageIndex(0);
    }, 0);

    return () => {
      window.clearTimeout(resetIndex);
    };
  }, [selectedVariant?.id, selectedColour]);

  const displayedPrice = selectedVariant?.priceOverride ?? product.price;
  const selectedVariantInStock = Boolean(selectedVariant && isItemAvailable(selectedVariant) && product.inStock);
  const needsSelection = hasVariantChoices && !selectedVariant;
  const canAddToCart = selectedVariant
    ? selectedVariantInStock
    : needsSelection
      ? false
      : isItemAvailable(product);
  const mainImage = galleryImages[selectedImageIndex]?.url || getFullProductImageUrl(product.image);
  const availableStock = selectedVariant ? getStockLimit(selectedVariant) : getStockLimit(product);

  const isOptionAvailable = (label: string, value: string) =>
    productVariants.some((variant) => {
      const options = getVariantOptions(variant);
      return (
        options[label] === value &&
        Object.entries(selectedOptions).every(
          ([selectedLabel, selectedValue]) =>
            selectedLabel === label ||
            !selectedValue ||
            options[selectedLabel] === selectedValue,
        )
      );
    });

  const getVariantImageForOption = (label: string, value: string) => {
    if (!isColourOption(label)) return undefined;
    return (product.colourImages ?? []).find(image => image.colourValue === value)?.url
      ?? productVariants.find(variant => getSelectedColour(getVariantOptions(variant)) === value && variant.imageUrl)?.imageUrl;
  };

  const chooseOption = (label: string, value: string) => {
    setSelectedOptions((current) => {
      if (current[label] === value) {
        const next = { ...current };
        delete next[label];
        return next;
      }

      const next: Record<string, string> = { ...current, [label]: value };

      // Drop any other choice that no longer has a matching combination.
      for (const otherLabel of Object.keys(next)) {
        if (otherLabel === label) {
          continue;
        }

        const stillValid = productVariants.some((variant) => {
          const options = getVariantOptions(variant);
          return Object.entries(next).every(
            ([checkLabel, checkValue]) =>
              !checkValue || options[checkLabel] === checkValue,
          );
        });

        if (!stillValid) {
          delete next[otherLabel];
        }
      }

      return next;
    });
  };

  const showImage = (nextIndex: number) => {
    if (galleryImages.length === 0) {
      return;
    }

    setSelectedImageIndex((nextIndex + galleryImages.length) % galleryImages.length);
  };

  const handleAddToCart = () => {
    if (needsSelection) {
      toast.error("Choose an option before adding this product to your cart.");
      return;
    }

    if (!canAddToCart) {
      toast.error(
        selectedVariant
          ? "This product option is currently out of stock."
          : "This product is currently out of stock.",
      );
      return;
    }

    const didAdd = addItem(product, 1, selectedVariant);
    if (didAdd) {
      toast.success(`${product.name} added to cart.`);
    }
  };

  const handleShare = async () => {
  const shareUrl = window.location.href;

  if (navigator.share) {
    try {
      await navigator.share({
        title: product.name,
        text: product.description,
        url: shareUrl,
      });
    } catch {
      // User cancelled sharing.
    }
    return;
  }

  await navigator.clipboard.writeText(shareUrl);
  toast.success("Product link copied to clipboard.");
};

  const handleBackToPreviousProductView = () => {
    const reopenContext = readProductDetailReturnContext();
    router.push(reopenContext?.originPath || "/products");
  };

  const availabilityLabel = selectedVariant
    ? selectedVariantInStock
      ? "In stock"
      : "Currently unavailable"
    : needsSelection
      ? "Select an option"
      : product.inStock
        ? "In stock"
        : "Currently unavailable";

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <main className="bg-gray-50/50 py-12">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <Button type="button" variant="outline" size="sm" onClick={handleBackToPreviousProductView}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Previous Product View
            </Button>
            <Link href="/products" className="text-pink-600 hover:text-pink-700">
              View all products
            </Link>
            <Link href="/registry" className="text-pink-600 hover:text-pink-700">
              Explore the registry
            </Link>
            <Link href="/blog" className="text-pink-600 hover:text-pink-700">
              Read parenting tips
            </Link>
          </div>

          <div className="grid min-w-0 gap-10 rounded-[32px] border bg-white p-6 shadow-xl lg:grid-cols-[1.05fr_0.95fr] lg:p-10">            
            {galleryImages.length > 0 ? (
              <div className="min-w-0 space-y-3">
                <div
                  className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[28px] bg-gray-100"
                  onTouchEnd={(event) => {
                    const startX = touchStartXRef.current;
                    touchStartXRef.current = null;
                    if (startX === null || galleryImages.length < 2) {
                      return;
                    }

                    const distance = event.changedTouches[0]?.clientX - startX;
                    if (Math.abs(distance) < 48) {
                      return;
                    }

                    showImage(selectedImageIndex + (distance < 0 ? 1 : -1));
                  }}
                  onTouchStart={(event) => {
                    touchStartXRef.current = event.touches[0]?.clientX ?? null;
                  }}
                >
                  <ImageWithFallback
                    src={mainImage}
                    alt={product.name}
                    className="max-h-full max-w-full object-contain"
                    decoding="async"
                  />
                  {galleryImages.length > 1 ? (
                    <>
                      <Button
                        type="button"
                        aria-label="Show previous image"
                        className="absolute left-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/90 p-0 text-gray-900 hover:bg-white"
                        onClick={() => showImage(selectedImageIndex - 1)}
                        variant="outline"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <Button
                        type="button"
                        aria-label="Show next image"
                        className="absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/90 p-0 text-gray-900 hover:bg-white"
                        onClick={() => showImage(selectedImageIndex + 1)}
                        variant="outline"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </>
                  ) : null}
                </div>
                {galleryImages.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {galleryImages.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        aria-label={`Show image ${index + 1}`}
                        className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                          index === selectedImageIndex
                            ? "border-pink-500"
                            : "border-transparent"
                        }`}
                        onClick={() => showImage(index)}
                      >
                        <ImageWithFallback
                          src={image.thumbnailUrl || image.url}
                          alt={`${product.name} thumbnail ${index + 1}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-[28px] bg-gray-100">
                <ImageWithFallback
                  src={getFullProductImageUrl(product.image)}
                  alt={product.name}
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            )}

            <div className="min-w-0 space-y-6">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{product.category}</Badge>
                  {product.brand ? <Badge variant="outline">{product.brand}</Badge> : null}
                  {product.ageRange ? <Badge variant="outline">{product.ageRange}</Badge> : null}
                </div>
                <h1 className="mt-4 break-words text-4xl font-bold text-gray-900">
                  {product.name}
                </h1>
                <p className="mt-4 text-3xl font-bold text-pink-600">
                  {formatNaira(displayedPrice)}
                </p>
              </div>

              <p className="text-base leading-7 text-gray-600">
                {product.description}
              </p>

              {hasVariantChoices ? (
                <div className="space-y-5 rounded-2xl border border-pink-100 bg-pink-50/60 p-5">
                  {optionGroups.map(([label, values]) => {
                    const isColorGroup = /^colou?rs?$/i.test(label);
                    return (
                      <div key={label} className="space-y-2">
                        <p className="text-sm font-semibold text-gray-900">{label}</p>
                        <div className="flex flex-wrap gap-2">
                          {values.map((value) => {
                            const colorImage = isColorGroup
                              ? getVariantImageForOption(label, value)
                              : undefined;
                            const isSelected = selectedOptions[label] === value;
                            const isAvailable = isOptionAvailable(label, value);

                            if (colorImage) {
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => chooseOption(label, value)}
                                  aria-label={value}
                                  disabled={!isAvailable}
                                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1 disabled:cursor-not-allowed disabled:opacity-40 ${
                                    isSelected ? "border-pink-500" : "border-transparent"
                                  }`}
                                >
                                  <span className="h-14 w-14 overflow-hidden rounded-md bg-gray-100">
                                    <ImageWithFallback
                                      src={colorImage}
                                      alt={value}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  </span>
                                  <span className="text-xs text-gray-700">{value}</span>
                                </button>
                              );
                            }

                            return (
                              <Button
                                key={value}
                                type="button"
                                variant={isSelected ? "default" : "outline"}
                                disabled={!isAvailable}
                                onClick={() => chooseOption(label, value)}
                              >
                                {value}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-sm text-gray-600">
                    {needsSelection
                      ? "Choose an option to continue."
                      : selectedVariant
                        ? selectedVariantInStock
                          ? selectedVariant.stockLimited
                            ? `Only ${selectedVariant.stockQuantity} left`
                            : "In stock"
                          : "This selected option is currently unavailable."
                        : product.inStock
                          ? availableStock !== undefined
                            ? `Only ${availableStock} left`
                            : "In stock"
                          : "Currently unavailable"}
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl bg-gray-50 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Why Parents Love It
                </h2>
                <ul className="mt-4 space-y-2 text-sm text-gray-700">
                  <li>Thoughtfully selected for baby gifting and everyday use.</li>
                  <li>Works beautifully in both direct purchases and registry plans.</li>
                  <li>Pairs with our curated baby essentials and registry support.</li>
                </ul>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  className="flex-1 cursor-pointer"
                  onClick={handleAddToCart}
                  disabled={!canAddToCart}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {needsSelection
                    ? "Finish Selecting"
                    : canAddToCart
                      ? "Add to Cart"
                      : "Out of Stock"}
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/registry">
                    <HeartHandshake className="mr-2 h-4 w-4" />
                    Add Through Registry
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 p-5 text-sm text-gray-700 sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-gray-900">Availability</p>
                  <p>{availabilityLabel}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Share Product</p>

                  <button
                    type="button"
                    onClick={handleShare}
                    className="mt-1 flex items-center gap-2 text-pink-600 hover:text-pink-700 cursor-pointer"
                  >
                    <Share2 className="h-4 w-4" />
                    <span>Share this page with friends and family.</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
