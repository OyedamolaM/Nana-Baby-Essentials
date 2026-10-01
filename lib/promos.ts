export type PromoType = "products" | "delivery_discount" | "free_delivery";

export function calculatePromoDiscount(
  promo: { promoType: PromoType; percentage: number; maximumDiscountAmount?: number | null },
  subtotal: number,
  deliveryFee: number,
) {
  const base = Math.max(0, promo.promoType === "products" ? subtotal : deliveryFee);
  const discount = promo.promoType === "free_delivery"
    ? base
    : Math.round(base * promo.percentage) / 100;
  return Math.min(base, discount, promo.maximumDiscountAmount ?? Infinity);
}
