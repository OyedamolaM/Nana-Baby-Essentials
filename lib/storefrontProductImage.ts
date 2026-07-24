/**
 * Transitional fallback only. Product records still holding a legacy data URL
 * use this route until the manual Storage migration has converted them.
 */
export function getLegacyProductImageFallbackUrl(productId: number) {
  return `/api/products/${encodeURIComponent(String(productId))}/image`;
}

const PRODUCT_IMAGE_THUMBNAIL_PATH =
  "/storage/v1/object/public/product-images/thumbnails/";
const PRODUCT_IMAGE_FULL_PATH = "/storage/v1/object/public/product-images/";

/**
 * List queries deliberately keep only the primary thumbnail in products.image.
 * Storage paths are deterministic, so a large display can safely use the
 * matching full file without widening every catalog query.
 */
export function getFullProductImageUrl(image: string | null | undefined) {
  const value = image?.trim() ?? "";
  if (!value) {
    return "";
  }

  return value.includes(PRODUCT_IMAGE_THUMBNAIL_PATH)
    ? value.replace(PRODUCT_IMAGE_THUMBNAIL_PATH, PRODUCT_IMAGE_FULL_PATH)
    : value;
}

/**
 * Two compact sources let dense phone displays use the full WebP when a 400px
 * thumbnail would need enlarging. Legacy and external image URLs stay single-source.
 */
export function getProductImageSrcSet(image: string | null | undefined) {
  const thumbnailUrl = image?.trim() ?? "";
  const fullUrl = getFullProductImageUrl(thumbnailUrl);

  if (!thumbnailUrl || fullUrl === thumbnailUrl) {
    return undefined;
  }

  return `${thumbnailUrl} 1x, ${fullUrl} 2x`;
}
