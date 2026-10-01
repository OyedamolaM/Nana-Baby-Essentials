"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Share2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { formatNaira, getVariantOptions, type StoreProductVariant } from "../../lib/commerce";
import {
  getCurrentProductReturnPath,
  persistProductDetailReturnContext,
} from "../../lib/productDetailReturn";
import { getFullProductImageUrl } from "../../lib/storefrontProductImage";
import { type Product } from "./ProductCard";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity?: number, variant?: StoreProductVariant) => void;
  addActionLabel?: string;
  compact?: boolean;
}

export function ProductDetailModal({
  product,
  open,
  onClose,
  onAddToCart,
  addActionLabel = "Add to Cart",
  compact = false,
}: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const [fetchedGalleryImages, setFetchedGalleryImages] = useState<
    Array<{
      id: string;
      url: string;
      thumbnailUrl?: string;
      isPrimary: boolean;
      sortOrder: number;
    }>
  >([]);

  const baseGalleryImages = useMemo(() => {
    const base = product?.images ?? [];
    return (base.length > 0 ? base : fetchedGalleryImages).filter((image) => image.url.trim());
  }, [product?.images, fetchedGalleryImages]);

  const [fetchedVariants, setFetchedVariants] = useState<StoreProductVariant[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  const allProductVariants = useMemo(() => {
    const base = product?.variants ?? [];
    return base.length > 0 ? base : fetchedVariants;
  }, [product?.variants, fetchedVariants]);
  const productVariants = useMemo(
    () => allProductVariants.filter((variant) => variant.inStock),
    [allProductVariants],
  );
  const hasVariantChoices = Boolean(product?.hasVariants);
  const optionGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const variant of productVariants) {
      for (const [label, value] of Object.entries(getVariantOptions(variant))) {
        groups.set(label, Array.from(new Set([...(groups.get(label) ?? []), value])));
      }
    }
    return Array.from(groups.entries());
  }, [productVariants]);

  const selectedVariant = useMemo(() => {
    if (!hasVariantChoices || productVariants.length === 0) {
      return undefined;
    }

    if (optionGroups.some(([label]) => !selectedOptions[label])) {
      return undefined;
    }

    return productVariants.find(
      (variant) =>
        optionGroups.every(([label]) => getVariantOptions(variant)[label] === selectedOptions[label]),
    );
  }, [hasVariantChoices, optionGroups, productVariants, selectedOptions]);

  const needsSelection = hasVariantChoices && !selectedVariant;
  const selectedVariantInStock = Boolean(selectedVariant && selectedVariant.inStock);

  // Slide through the selected variant's own photos when it has any;
  // otherwise fall back to the product's general gallery.
  const galleryImages =
    selectedVariant?.images && selectedVariant.images.length > 0
      ? selectedVariant.images
      : baseGalleryImages;

  useEffect(() => {
    const resetIndex = window.setTimeout(() => {
      setSelectedImageIndex(0);
    }, 0);

    return () => {
      window.clearTimeout(resetIndex);
    };
  }, [selectedVariant?.id]);

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

  const getVariantImageForOption = (label: string, value: string) =>
    productVariants.find((variant) => {
      const options = getVariantOptions(variant);
      return (
        options[label] === value &&
        Boolean(variant.imageUrl) &&
        Object.entries(selectedOptions).every(
          ([selectedLabel, selectedValue]) =>
            selectedLabel === label ||
            !selectedValue ||
            options[selectedLabel] === selectedValue,
        )
      );
    })?.imageUrl;

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

  const canAddToCart = selectedVariant
    ? selectedVariantInStock
    : needsSelection
      ? false
      : Boolean(product?.inStock);
  const availableStock = selectedVariant
    ? selectedVariant.stockQuantity
    : Math.max(0, Math.floor(Number(product?.stockQuantity ?? 0)));


  const showImage = (nextIndex: number) => {
    if (galleryImages.length === 0) {
      return;
    }
    setSelectedImageIndex((nextIndex + galleryImages.length) % galleryImages.length);
  };

  useEffect(() => {
    if (!open || !product || !hasSupabaseEnv || !product.hasVariants) {
      return;
    }

    if (product.variants && product.variants.length > 0) {
      return;
    }

    let isMounted = true;

    const loadVariants = async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select(
           "id, size, color, options, sku, price_override, stock_quantity, in_stock, variant_images:product_images(id, url, thumbnail_url, sort_order, is_primary)",
        )
        .eq("product_id", product.id)
        .order("created_at", { ascending: true });

      if (!isMounted || error || !data) {
        return;
      }

      setFetchedVariants(
        data.map((row) => {
          const variantImages = (Array.isArray(row.variant_images) ? row.variant_images : [])
            .filter((image): image is NonNullable<typeof image> => Boolean(image?.id && image?.url))
            .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
            .map((image) => ({
              id: String(image.id),
              url: image.url,
              thumbnailUrl: image.thumbnail_url ?? undefined,
              isPrimary: Boolean(image.is_primary),
              sortOrder: Number(image.sort_order ?? 0),
            }));

          return {
            id: String(row.id),
            size: row.size ?? undefined,
             color: row.color ?? undefined,
             options: row.options && typeof row.options === "object" ? row.options : undefined,
            sku: row.sku ?? undefined,
            priceOverride:
              row.price_override === null || row.price_override === undefined
                ? undefined
                : Number(row.price_override),
            stockQuantity: Math.max(0, Math.floor(Number(row.stock_quantity ?? 0))),
            inStock: Boolean(row.in_stock),
            images: variantImages,
            imageUrl: variantImages[0]?.url,
            imageThumbnailUrl: variantImages[0]?.thumbnailUrl,
          };
        }),
      );
    };

    void loadVariants();

    return () => {
      isMounted = false;
    };
  }, [open, product?.id, product?.hasVariants, product?.variants?.length, hasSupabaseEnv]);

  useEffect(() => {
    if (!open || !product || !hasSupabaseEnv) {
      return;
    }

    if (product.images && product.images.length > 0) {
      return;
    }

    let isMounted = true;

    const loadGalleryImages = async () => {
      const { data, error } = await supabase
        .from("product_images")
        .select("id, url, thumbnail_url, is_primary, sort_order")
        .eq("product_id", product.id)
        .eq("is_variant_only", false)
        .order("sort_order", { ascending: true });

      if (!isMounted || error || !data) {
        return;
      }

      setFetchedGalleryImages(
        data.map((row) => ({
          id: String(row.id),
          url: row.url,
          thumbnailUrl: row.thumbnail_url ?? undefined,
          isPrimary: Boolean(row.is_primary),
          sortOrder: Number(row.sort_order ?? 0),
        })),
      );
    };

    void loadGalleryImages();

    return () => {
      isMounted = false;
    };
  }, [open, product?.id, product?.images?.length, hasSupabaseEnv]);

  useEffect(() => {
    if (!product) {
      return;
    }

    const resetIndex = window.setTimeout(() => {
      setSelectedImageIndex(0);
      setSelectedOptions({});
    }, 0);

    return () => {
      window.clearTimeout(resetIndex);
    };
  }, [product?.id]);

  if (!product) {
    return null;
  }

  const handleAddToCart = () => {
    if (needsSelection) {
      toast.error("Finish selecting an option, or clear your selection to add the standard product.");
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

    onAddToCart(product, quantity, selectedVariant);
    onClose();
  };

  const toggleWishlist = async () => {
    if (!user) {
      toast.error("Please sign in to add items to your wishlist.");
      return;
    }

    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    setLoading(true);

    if (isInWishlist) {
      const { error } = await supabase
        .from("wishlists")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", product.id);

      if (error) {
        toast.error("Failed to remove from wishlist.");
      } else {
        setIsInWishlist(false);
        toast.success("Removed from wishlist.");
      }
    } else {
      const { error } = await supabase.from("wishlists").insert({
        user_id: user.id,
        product_id: product.id,
      });

      if (error) {
        toast.error("Failed to add to wishlist.");
      } else {
        setIsInWishlist(true);
        toast.success("Added to wishlist.");
      }
    }

    setLoading(false);
  };

  const handleShare = async () => {
    const shareUrl = new URL(`/products/${product.slug}`, window.location.origin);

    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: product.description,
          url: shareUrl.toString(),
        });
      } catch {
        // Ignore cancelled shares.
      }
      return;
    }

    await navigator.clipboard.writeText(shareUrl.toString());
    toast.success("Link copied to clipboard.");
  };

  const handleOpenFullProductPage = () => {
    persistProductDetailReturnContext({
      originPath: getCurrentProductReturnPath(),
      product,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto max-w-[calc(100%-1rem)] p-4 sm:max-w-4xl sm:p-6 md:max-w-5xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 min-[460px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-[460px]:gap-5 md:grid-cols-2 md:gap-8">
          {/* Left Column */}
          <div className="space-y-3">
            <div
              className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-gray-50 min-[460px]:aspect-square"
              onTouchStart={(event) => {
                touchStartXRef.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const startX = touchStartXRef.current;
                touchStartXRef.current = null;

                if (startX === null || galleryImages.length < 2) return;

                const distance = event.changedTouches[0]?.clientX - startX;

                if (Math.abs(distance) < 48) return;

                showImage(selectedImageIndex + (distance < 0 ? 1 : -1));
              }}
            >
              <ImageWithFallback
                src={galleryImages[selectedImageIndex]?.url || getFullProductImageUrl(product.image)}
                alt={product.name}
                className="max-h-full max-w-full object-contain"
                decoding="async"
              />

              {galleryImages.length > 1 && (
                <>
                  <Button
                    type="button"
                    aria-label="Show previous image"
                    variant="outline"
                    className="absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-white/90 p-0 text-gray-900 hover:bg-white"
                    onClick={() => showImage(selectedImageIndex - 1)}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>

                  <Button
                    type="button"
                    aria-label="Show next image"
                    variant="outline"
                    className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-white/90 p-0 text-gray-900 hover:bg-white"
                    onClick={() => showImage(selectedImageIndex + 1)}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}
            </div>

            {galleryImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {galleryImages.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    aria-label={`Show image ${index + 1}`}
                    onClick={() => showImage(index)}
                    className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                      index === selectedImageIndex
                        ? "border-pink-500"
                        : "border-transparent"
                    }`}
                  >
                    <ImageWithFallback
                      src={image.thumbnailUrl || image.url}
                      alt={`${product.name} thumbnail ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-5 min-[460px]:space-y-4">
            {/* Product Info */}
            <div className="space-y-3">
              <div className="space-y-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold text-gray-900">
                    {product.name}
                  </h2>

                  <p className="mt-2 text-3xl font-bold text-pink-600">
                    {formatNaira(selectedVariant?.priceOverride ?? product.price)}
                  </p>

                   {!compact ? <p className="mt-3 text-sm text-gray-600">{product.description}</p> : null}
                </div>

                <Badge className="w-fit" variant={canAddToCart ? "secondary" : "destructive"}>
                  {selectedVariant
                    ? selectedVariantInStock
                      ? "In Stock"
                      : "Out of Stock"
                    : needsSelection
                      ? "Select an option"
                      : product.inStock
                        ? "In Stock"
                        : "Out of Stock"}
                </Badge>
              </div>

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
                              <span className="h-12 w-12 overflow-hidden rounded-md bg-gray-100">
                                <ImageWithFallback
                                  src={colorImage}
                                  alt={value}
                                  className="h-full w-full object-cover"
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
                            size="sm"
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

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  Quantity
                </span>

                <div className="inline-flex items-center rounded-full border border-gray-200 bg-white p-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setQuantity((current) => Math.max(current - 1, 1))
                    }
                    disabled={quantity <= 1}
                  >
                    -
                  </Button>

                  <span className="mx-3 min-w-[2rem] text-center text-sm font-medium">
                    {quantity}
                  </span>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuantity((current) => current + 1)}
                    disabled={availableStock > 0 && quantity >= availableStock}
                  >
                    +
                  </Button>
                </div>

                {availableStock > 0 ? (
                  <span className="text-xs font-medium text-pink-700">
                    Only {availableStock} left
                  </span>
                ) : null}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1"
                onClick={handleAddToCart}
                disabled={!canAddToCart}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                {needsSelection
                  ? "Finish Selecting"
                  : canAddToCart
                    ? addActionLabel
                    : "Out of Stock"}
              </Button>

              {!compact ? <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={toggleWishlist}
                disabled={loading}
              >
                <Heart
                  className={`h-5 w-5 ${
                    isInWishlist ? "fill-red-500 text-red-500" : ""
                  }`}
                />
              </Button> : null}

              {!compact ? <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleShare}
              >
                <Share2 className="h-5 w-5" />
              </Button> : null}
            </div>

             {!compact ? <Button asChild type="button" variant="ghost" className="w-full">
              <Link
                href={`/products/${product.slug}`}
                onClick={handleOpenFullProductPage}
              >
                Open Full Product Page
              </Link>
             </Button> : null}

             {/* Product Details */}
             {!compact ? <>
              <div className="space-y-2 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">SKU:</span>
                <span className="font-semibold">
                  BB-{product.id.toString().padStart(6, "0")}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Availability:</span>
                <span className={canAddToCart ? "text-green-600" : "text-red-600"}>
                  {selectedVariant
                    ? selectedVariantInStock
                      ? "In Stock"
                      : "Out of Stock"
                    : needsSelection
                      ? "Select an option"
                      : product.inStock
                        ? "In Stock"
                        : "Out of Stock"}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Category:</span>
                <span className="font-semibold">{product.category}</span>
              </div>
            </div>

             {/* Shipping */}
             <div className="rounded-lg bg-pink-50 p-4">
              <h4 className="mb-2 font-semibold text-gray-900">
                Shipping Information
              </h4>

              <ul className="space-y-1 text-sm text-gray-600">
                <li>- Delivery within 2Ã¢â‚¬â€œ5 days in Lagos</li>
                <li>- 3Ã¢â‚¬â€œ7 days for other locations</li>
              </ul>
             </div>
             </> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
