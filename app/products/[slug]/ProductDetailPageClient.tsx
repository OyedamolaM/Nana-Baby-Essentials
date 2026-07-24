"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  HeartHandshake,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";

import { type StoreProduct, formatNaira } from "../../../lib/commerce";
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
  const galleryImages = useMemo(
    () => (product.images ?? []).filter((image) => image.url.trim()),
    [product.images],
  );
  const productVariants = useMemo(() => product.variants ?? [], [product.variants]);
  const hasVariantChoices = Boolean(product.hasVariants);
  const hasSizePicker = productVariants.some((variant) => Boolean(variant.size));
  const hasColorPicker = productVariants.some((variant) => Boolean(variant.color));
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const touchStartXRef = useRef<number | null>(null);

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

  const displayedPrice = selectedVariant?.priceOverride ?? product.price;
  const selectedVariantInStock = Boolean(
    selectedVariant && selectedVariant.inStock && selectedVariant.stockQuantity > 0,
  );
  const needsSelection =
    hasVariantChoices &&
    (!selectedVariant || (hasSizePicker && !selectedSize) || (hasColorPicker && !selectedColor));
  const canAddToCart = hasVariantChoices
    ? selectedVariantInStock
    : product.inStock;
  const mainImage = galleryImages[selectedImageIndex]?.url || getFullProductImageUrl(product.image);

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

  const chooseSize = (size: string) => {
    setSelectedSize(size);
    if (
      selectedColor &&
      !productVariants.some(
        (variant) => variant.size === size && variant.color === selectedColor,
      )
    ) {
      setSelectedColor("");
    }
  };

  const chooseColor = (color: string) => {
    setSelectedColor(color);
    if (
      selectedSize &&
      !productVariants.some(
        (variant) => variant.color === color && variant.size === selectedSize,
      )
    ) {
      setSelectedSize("");
    }
  };

  const showImage = (nextIndex: number) => {
    if (galleryImages.length === 0) {
      return;
    }

    setSelectedImageIndex((nextIndex + galleryImages.length) % galleryImages.length);
  };

  const handleAddToCart = () => {
    if (hasVariantChoices && productVariants.length === 0) {
      toast.error("This product's options are being updated. Please try again shortly.");
      return;
    }

    if (needsSelection || (hasVariantChoices && !selectedVariant)) {
      toast.error("Choose the available product options before adding it to cart.");
      return;
    }

    if (!canAddToCart) {
      toast.error("This product option is currently out of stock.");
      return;
    }

    const didAdd = addItem(product, 1, selectedVariant);
    if (didAdd) {
      toast.success(`${product.name} added to cart.`);
    }
  };

  const handleBackToPreviousProductView = () => {
    const reopenContext = readProductDetailReturnContext();
    router.push(reopenContext?.originPath || "/products");
  };

  const availabilityLabel = hasVariantChoices
    ? needsSelection
      ? "Select an option"
      : selectedVariantInStock
        ? "In stock"
        : "Currently unavailable"
    : product.inStock
      ? "In stock"
      : "Currently unavailable";

  return (
    <div className="min-h-screen bg-white">
      <main className="bg-gradient-to-br from-white via-pink-50/40 to-blue-50/40 py-12">
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

          <div className="grid gap-10 rounded-[32px] border bg-white p-6 shadow-xl lg:grid-cols-[1.05fr_0.95fr] lg:p-10">
            {galleryImages.length > 0 ? (
              <div className="space-y-3">
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
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[28px] bg-gray-100">
                <ImageWithFallback
                  src={getFullProductImageUrl(product.image)}
                  alt={product.name}
                  className="max-h-full max-w-full object-contain"
                  decoding="async"
                />
              </div>
            )}

            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{product.category}</Badge>
                  {product.brand ? <Badge variant="outline">{product.brand}</Badge> : null}
                  {product.ageRange ? <Badge variant="outline">{product.ageRange}</Badge> : null}
                </div>
                <h1 className="mt-4 text-4xl font-bold text-gray-900">
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
                  {hasSizePicker ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-gray-900">Size</p>
                      <div className="flex flex-wrap gap-2">
                        {visibleSizeOptions.map((size) => (
                          <Button
                            key={size}
                            type="button"
                            variant={selectedSize === size ? "default" : "outline"}
                            onClick={() => chooseSize(size)}
                          >
                            {size}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {hasColorPicker ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-gray-900">Color</p>
                      <div className="flex flex-wrap gap-2">
                        {visibleColorOptions.map((color) => (
                          <Button
                            key={color}
                            type="button"
                            variant={selectedColor === color ? "default" : "outline"}
                            onClick={() => chooseColor(color)}
                          >
                            {color}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="text-sm text-gray-600">
                    {productVariants.length === 0
                      ? "Options are being updated. Please check back shortly."
                      : needsSelection
                        ? "Select the available option before adding this product to cart."
                        : selectedVariantInStock
                          ? `${selectedVariant?.stockQuantity} available`
                          : "This selected option is currently unavailable."}
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
                  className="flex-1"
                  onClick={handleAddToCart}
                  disabled={!canAddToCart}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {hasVariantChoices && needsSelection
                    ? "Select Options"
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
                  <p className="font-semibold text-gray-900">Product Link</p>
                  <p>Share this page directly with friends and family.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
