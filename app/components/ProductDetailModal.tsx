"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Share2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { formatNaira, type StoreProductVariant } from "../../lib/commerce";
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
}

export function ProductDetailModal({
  product,
  open,
  onClose,
  onAddToCart,
  addActionLabel = "Add to Cart",
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

  const galleryImages = useMemo(() => {
    const base = product?.images ?? [];
    return (base.length > 0 ? base : fetchedGalleryImages).filter((image) => image.url.trim());
  }, [product?.images, fetchedGalleryImages]);

  const [fetchedVariants, setFetchedVariants] = useState<StoreProductVariant[]>([]);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");

  const productVariants = useMemo(() => {
    const base = product?.variants ?? [];
    return base.length > 0 ? base : fetchedVariants;
  }, [product?.variants, fetchedVariants]);
  const hasVariantChoices = Boolean(product?.hasVariants);
  const hasSizePicker = productVariants.some((variant) => Boolean(variant.size));
  const hasColorPicker = productVariants.some((variant) => Boolean(variant.color));

  const selectedVariant = useMemo(() => {
    if (!hasVariantChoices || productVariants.length === 0) {
      return undefined;
    }

    if (hasSizePicker && !selectedSize) {
      return undefined;
    }

    if (hasColorPicker && !selectedColor) {
      return undefined;
    }

    return productVariants.find(
      (variant) =>
        (!hasSizePicker || variant.size === selectedSize) &&
        (!hasColorPicker || variant.color === selectedColor),
    );
  }, [hasColorPicker, hasSizePicker, hasVariantChoices, productVariants, selectedColor, selectedSize]);

  const needsSelection =
    hasVariantChoices &&
    (!selectedVariant || (hasSizePicker && !selectedSize) || (hasColorPicker && !selectedColor));
  const selectedVariantInStock = Boolean(selectedVariant && selectedVariant.inStock);

  const sizeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          productVariants
            .map((variant) => variant.size)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [productVariants],
  );
  const colorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          productVariants
            .map((variant) => variant.color)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [productVariants],
  );
  const visibleSizeOptions = useMemo(
    () =>
      sizeOptions.filter((size) =>
        productVariants.some(
          (variant) =>
            variant.size === size &&
            (!selectedColor || !hasColorPicker || variant.color === selectedColor),
        ),
      ),
    [hasColorPicker, productVariants, selectedColor, sizeOptions],
  );
  const visibleColorOptions = useMemo(
    () =>
      colorOptions.filter((color) =>
        productVariants.some(
          (variant) =>
            variant.color === color &&
            (!selectedSize || !hasSizePicker || variant.size === selectedSize),
        ),
      ),
    [colorOptions, hasSizePicker, productVariants, selectedSize],
  );

  const getVariantImageForColor = (color: string) =>
    productVariants.find(
      (variant) =>
        variant.color === color &&
        variant.imageUrl &&
        (!selectedSize || !hasSizePicker || variant.size === selectedSize),
    )?.imageUrl;

  const chooseSize = (size: string) => {
    setSelectedSize(size);
    if (
      selectedColor &&
      !productVariants.some((variant) => variant.size === size && variant.color === selectedColor)
    ) {
      setSelectedColor("");
    }
  };

  const chooseColor = (color: string) => {
    setSelectedColor(color);
    if (
      selectedSize &&
      !productVariants.some((variant) => variant.color === color && variant.size === selectedSize)
    ) {
      setSelectedSize("");
    }
  };

  const canAddToCart = hasVariantChoices ? selectedVariantInStock : Boolean(product?.inStock);


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
          "id, size, color, sku, price_override, stock_quantity, in_stock, image_id, variant_image:product_images(url, thumbnail_url)",
        )
        .eq("product_id", product.id)
        .order("created_at", { ascending: true });

      if (!isMounted || error || !data) {
        return;
      }

      setFetchedVariants(
        data.map((row) => {
          const variantImageRow = Array.isArray(row.variant_image)
            ? row.variant_image[0]
            : row.variant_image;

          return {
            id: String(row.id),
            size: row.size ?? undefined,
            color: row.color ?? undefined,
            sku: row.sku ?? undefined,
            priceOverride:
              row.price_override === null || row.price_override === undefined
                ? undefined
                : Number(row.price_override),
            stockQuantity: Math.max(0, Math.floor(Number(row.stock_quantity ?? 0))),
            inStock: Boolean(row.in_stock),
            imageId: row.image_id ?? undefined,
            imageUrl: variantImageRow?.url ?? undefined,
            imageThumbnailUrl: variantImageRow?.thumbnail_url ?? undefined,
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
      setSelectedSize("");
      setSelectedColor("");
    }, 0);

    return () => {
      window.clearTimeout(resetIndex);
    };
  }, [product?.id]);

  if (!product) {
    return null;
  }

  const handleAddToCart = () => {
    onAddToCart(product, quantity);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-4xl md:max-w-5xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Left Column */}
          <div className="space-y-3">
            <div
              className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gray-50"
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
                src={
                  galleryImages[selectedImageIndex]?.url ||
                  getFullProductImageUrl(product.image)
                }
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
          <div className="space-y-6">
            {/* Product Info */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">
                    {product.name}
                  </h2>

                  <p className="mt-2 text-3xl font-bold text-pink-600">
                    {formatNaira(product.price)}
                  </p>

                  <p className="mt-3 text-sm text-gray-600">
                    {product.description}
                  </p>
                </div>

                <Badge
                  variant={product.inStock ? "secondary" : "destructive"}
                >
                  {product.inStock ? "In Stock" : "Out of Stock"}
                </Badge>
              </div>

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
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {product.hasVariants ? (
                <Button asChild type="button" className="flex-1">
                  <Link
                    href={`/products/${product.slug}`}
                    onClick={handleOpenFullProductPage}
                  >
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    Choose Options
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  className="flex-1"
                  onClick={handleAddToCart}
                  disabled={!product.inStock}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {product.inStock ? addActionLabel : "Out of Stock"}
                </Button>
              )}

              <Button
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
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleShare}
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </div>

            <Button asChild type="button" variant="ghost" className="w-full">
              <Link
                href={`/products/${product.slug}`}
                onClick={handleOpenFullProductPage}
              >
                Open Full Product Page
              </Link>
            </Button>

            {/* Product Details */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">SKU:</span>
                <span className="font-semibold">
                  BB-{product.id.toString().padStart(6, "0")}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Availability:</span>
                <span
                  className={
                    product.inStock ? "text-green-600" : "text-red-600"
                  }
                >
                  {product.inStock ? "In Stock" : "Out of Stock"}
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
                <li>- Delivery within 2–5 days in Lagos</li>
                <li>- 3–7 days for other locations</li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}