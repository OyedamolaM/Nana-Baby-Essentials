export type PromoType = "products" | "delivery_discount" | "free_delivery";

export type PromoSnapshot = { promo_type: PromoType; percentage: number; maximum_discount_amount?: number | null };

export function calculatePromoDiscount(
  promo: { promoType: PromoType; percentage: number; maximumDiscountAmount?: number | null; details?: PromoSnapshot[] | null },
  subtotal: number,
  deliveryFee: number,
) {
  if (promo.details?.length) {
    let products = 0, delivery = 0;
    for (const item of promo.details) {
      const amount = calculatePromoDiscount({ promoType: item.promo_type, percentage: Number(item.percentage), maximumDiscountAmount: item.maximum_discount_amount }, subtotal, deliveryFee);
      if (item.promo_type === "products") products += amount; else delivery += amount;
    }
    return Math.min(Math.max(0, subtotal), products) + Math.min(Math.max(0, deliveryFee), delivery);
  }
  const base = Math.max(0, promo.promoType === "products" ? subtotal : deliveryFee);
  const discount = promo.promoType === "free_delivery"
    ? base
    : Math.round(base * promo.percentage) / 100;
  return Math.min(base, discount, promo.maximumDiscountAmount ?? Infinity);
}
