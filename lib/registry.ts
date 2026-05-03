import {
  getProductSellingPrice,
  mapProductRecord,
  type ProductRecord,
  type StoreProduct,
} from "./commerce";

export interface RegistryRecord {
  id: string;
  user_id: string;
  share_code: string;
  name: string;
  whatsapp?: string | null;
  due_month?: string | null;
  baby_gender?: string | null;
  additional_info?: string | null;
  created_at: string;
}

export interface RegistryItemRecord {
  id: string;
  registry_id: string;
  product_id: number;
  requested_quantity?: number | null;
  purchased_quantity?: number | null;
  unit_price_snapshot?: number | null;
  note?: string | null;
  created_at: string;
  products?: ProductRecord | null;
}

export interface RegistryItem {
  id: string;
  registryId: string;
  productId: number;
  requestedQuantity: number;
  purchasedQuantity: number;
  unitPriceSnapshot: number;
  note: string;
  createdAt: string;
  product: StoreProduct | null;
}

export interface RegistryOrderRecord {
  id: string;
  registry_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone?: string | null;
  buyer_message?: string | null;
  total_amount: number;
  contribution_type: "items" | "cash" | "mixed";
  status: string;
  paystack_reference?: string | null;
  created_at: string;
}

export function mapRegistryItemRecord(record: RegistryItemRecord): RegistryItem {
  const product = record.products ? mapProductRecord(record.products) : null;
  const fallbackUnitPrice = record.products
    ? getProductSellingPrice(record.products)
    : 0;

  return {
    id: record.id,
    registryId: record.registry_id,
    productId: Number(record.product_id),
    requestedQuantity: Math.max(1, Number(record.requested_quantity ?? 1)),
    purchasedQuantity: Math.max(0, Number(record.purchased_quantity ?? 0)),
    unitPriceSnapshot: Number(record.unit_price_snapshot ?? fallbackUnitPrice),
    note: record.note ?? "",
    createdAt: record.created_at,
    product,
  };
}

export function getRemainingRegistryQuantity(item: RegistryItem) {
  return Math.max(0, item.requestedQuantity - item.purchasedQuantity);
}

export function formatDueMonth(dueMonth?: string | null) {
  if (!dueMonth) {
    return "N/A";
  }

  const date = new Date(`${dueMonth}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dueMonth
    : date.toLocaleDateString("en-NG", {
        month: "long",
        year: "numeric",
      });
}

export function formatBabyGender(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  if (value === "neutral") {
    return "Surprise / Neutral";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
