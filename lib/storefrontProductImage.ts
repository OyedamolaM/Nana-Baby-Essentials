export function getStorefrontProductImageUrl(productId: number) {
  return `/api/products/${encodeURIComponent(String(productId))}/image`;
}
