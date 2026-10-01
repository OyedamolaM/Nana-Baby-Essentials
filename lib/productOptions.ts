import { getVariantOptions, type StoreProduct, type StoreProductImage, type StoreProductVariant } from "./commerce";

export function isColourOption(label: string) {
  return /^(color|colour)$/i.test(label.trim());
}

export function getSelectedColour(options: Record<string, string>) {
  return Object.entries(options).find(([label]) => isColourOption(label))?.[1];
}

/** An explicit stock setting controls the cap; zero is a sold-out tracked item. */
export function getStockLimit(item: Pick<StoreProduct, "stockLimited" | "stockQuantity">) {
  return item.stockLimited ? Math.max(0, Math.floor(Number(item.stockQuantity ?? 0))) : undefined;
}

export function isItemAvailable(item: Pick<StoreProduct, "inStock" | "stockLimited" | "stockQuantity">) {
  return item.inStock && (!item.stockLimited || Number(item.stockQuantity ?? 0) > 0);
}

export function getSelectionGallery(
  colourImages: StoreProductImage[],
  options: Record<string, string>,
  variant?: StoreProductVariant,
) {
  if (variant?.images?.length) return variant.images;
  const colour = getSelectedColour(options);
  return colour ? colourImages.filter((image) => image.colourValue === colour) : [];
}

export function getCartGallery(product: StoreProduct, variant?: StoreProductVariant) {
  return getSelectionGallery(product.colourImages ?? [], variant ? getVariantOptions(variant) : {}, variant);
}
