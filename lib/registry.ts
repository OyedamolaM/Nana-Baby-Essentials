import {
  getProductSellingPrice,
  mapProductRecord,
  toNairaAmount,
  type ProductRecord,
  type StoreProduct,
} from "./commerce";
import { createSlug } from "./content";

export interface RegistryRecord {
  id: string;
  user_id: string;
  share_code: string;
  name: string;
  status?: string | null;
  closed_at?: string | null;
  closed_note?: string | null;
  fulfillment_status?: "collecting" | "ready_for_shipping" | "shipped" | "completed" | null;
  ready_for_shipping_at?: string | null;
  shipped_at?: string | null;
  completed_at?: string | null;
  fulfillment_updated_at?: string | null;
  partner_email?: string | null;
  partner_name?: string | null;
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
  funded_amount?: number | null;
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
  fundedAmount: number;
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
  shipping_address?: unknown;
  paid_at?: string | null;
  created_at: string;
}

export interface RegistryOrderItemRecord {
  id: string;
  registry_order_id: string;
  registry_item_id?: string | null;
  product_id?: number | null;
  quantity?: number | null;
  amount: number;
  created_at: string;
}

export interface RegistryContributionRecord {
  id: string;
  registry_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone?: string | null;
  buyer_message?: string | null;
  amount: number;
  status: string;
  paystack_reference?: string | null;
  paid_at?: string | null;
  created_at: string;
}

export interface RegistrySummary {
  fundedAmount: number;
  purchased: number;
  remainingAmount: number;
  remainingQuantity: number;
  requested: number;
  totalNeededAmount: number;
}

export interface RegistryPaymentActivity {
  id: string;
  registryId: string;
  buyerEmail: string;
  buyerMessage?: string | null;
  buyerName: string;
  buyerPhone?: string | null;
  createdAt: string;
  itemLabels: string[];
  paystackReference?: string | null;
  paidAt?: string | null;
  status: string;
  totalAmount: number;
  type: "item" | "cash";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildRegistryDashboardPath(registry: {
  id?: string | null;
  name?: string | null;
  share_code?: string | null;
}) {
  const shareCode = registry.share_code?.trim() || registry.id?.trim() || "registry";
  const slug = createSlug(registry.name?.trim() || "registry");
  const readableSegment = slug ? `${slug}-${shareCode}` : shareCode;

  return `/dashboard/registries/${readableSegment}`;
}

export function resolveRegistryDashboardLookup(routeParam: string) {
  const normalized = routeParam.trim();

  if (UUID_PATTERN.test(normalized)) {
    return {
      field: "id" as const,
      value: normalized,
    };
  }

  const shareCodeMatch = normalized.match(/-([A-Za-z0-9]{6,20})$/);

  return {
    field: "share_code" as const,
    value: (shareCodeMatch?.[1] ?? normalized).toUpperCase(),
  };
}

export function mapRegistryItemRecord(record: RegistryItemRecord): RegistryItem {
  const product = record.products ? mapProductRecord(record.products) : null;
  const fallbackUnitPrice = record.products
    ? getProductSellingPrice(record.products)
    : 0;
  const requestedQuantity = Math.max(1, Number(record.requested_quantity ?? 1));
  const purchasedQuantity = Math.max(0, Number(record.purchased_quantity ?? 0));
  const unitPriceSnapshot = Number(record.unit_price_snapshot ?? fallbackUnitPrice);
  const targetAmount = toNairaAmount(unitPriceSnapshot) * requestedQuantity;
  const fundedFallback = toNairaAmount(unitPriceSnapshot) * purchasedQuantity;
  const fundedAmount = Math.min(
    targetAmount,
    Math.max(0, Number(record.funded_amount ?? fundedFallback)),
  );

  return {
    id: record.id,
    registryId: record.registry_id,
    productId: Number(record.product_id),
    requestedQuantity,
    purchasedQuantity,
    fundedAmount,
    unitPriceSnapshot,
    note: record.note ?? "",
    createdAt: record.created_at,
    product,
  };
}

export function getRegistryItemUnitAmount(item: RegistryItem) {
  return Math.max(0, toNairaAmount(item.unitPriceSnapshot));
}

export function getRegistryItemTargetAmount(item: RegistryItem) {
  return getRegistryItemUnitAmount(item) * item.requestedQuantity;
}

export function getRegistryItemFundedAmount(item: RegistryItem) {
  return Math.min(
    getRegistryItemTargetAmount(item),
    Math.max(0, Math.round(item.fundedAmount)),
  );
}

export function getRemainingRegistryQuantity(item: RegistryItem) {
  return Math.max(0, item.requestedQuantity - item.purchasedQuantity);
}

export function getRegistryItemRemainingAmount(item: RegistryItem) {
  return Math.max(0, getRegistryItemTargetAmount(item) - getRegistryItemFundedAmount(item));
}

export function getRegistryItemSelectionAmount(item: RegistryItem, quantity: number) {
  const normalizedQuantity = Math.max(0, Math.floor(quantity));
  const unitAmount = getRegistryItemUnitAmount(item);
  const remainingAmount = getRegistryItemRemainingAmount(item);

  if (normalizedQuantity <= 0 || unitAmount <= 0 || remainingAmount <= 0) {
    return 0;
  }

  const partialUnitAmount =
    item.purchasedQuantity < item.requestedQuantity
      ? getRegistryItemFundedAmount(item) % unitAmount
      : 0;

  return Math.min(
    remainingAmount,
    Math.max((normalizedQuantity * unitAmount) - partialUnitAmount, 0),
  );
}

export function summarizeRegistryItems(items: RegistryItem[]): RegistrySummary {
  return items.reduce<RegistrySummary>(
    (summary, item) => {
      summary.requested += item.requestedQuantity;
      summary.purchased += item.purchasedQuantity;
      summary.remainingQuantity += getRemainingRegistryQuantity(item);
      summary.totalNeededAmount += getRegistryItemTargetAmount(item);
      summary.fundedAmount += getRegistryItemFundedAmount(item);
      summary.remainingAmount += getRegistryItemRemainingAmount(item);
      return summary;
    },
    {
      fundedAmount: 0,
      purchased: 0,
      remainingAmount: 0,
      remainingQuantity: 0,
      requested: 0,
      totalNeededAmount: 0,
    },
  );
}

export function buildRegistryPaymentActivities({
  contributions,
  orderItems,
  orders,
  registryItems,
}: {
  contributions: RegistryContributionRecord[];
  orderItems: RegistryOrderItemRecord[];
  orders: RegistryOrderRecord[];
  registryItems: RegistryItem[];
}) {
  const completedOrders = orders.filter((order) => order.status === "paid");
  const completedContributions = contributions.filter(
    (contribution) => contribution.status === "paid",
  );
  const registryItemsById = Object.fromEntries(
    registryItems.map((item) => [item.id, item]),
  ) as Record<string, RegistryItem>;

  const orderItemsByOrderId = orderItems.reduce<Record<string, RegistryOrderItemRecord[]>>(
    (accumulator, orderItem) => {
      const existing = accumulator[orderItem.registry_order_id] ?? [];
      existing.push(orderItem);
      accumulator[orderItem.registry_order_id] = existing;
      return accumulator;
    },
    {},
  );

  const itemActivities = completedOrders.map<RegistryPaymentActivity>((order) => {
    const labels = (orderItemsByOrderId[order.id] ?? []).map((orderItem) => {
      const registryItem = orderItem.registry_item_id
        ? registryItemsById[orderItem.registry_item_id]
        : null;
      const itemName = registryItem?.product?.name ?? "Registry item";
      const quantity = Math.max(0, Number(orderItem.quantity ?? 0));
      const quantityLabel = quantity > 0 ? ` x ${quantity}` : "";
      return `${itemName}${quantityLabel} (${formatCurrencyAmount(orderItem.amount)})`;
    });

    return {
      id: order.id,
      registryId: order.registry_id,
      buyerEmail: order.buyer_email,
      buyerMessage: order.buyer_message ?? null,
      buyerName: order.buyer_name,
      buyerPhone: order.buyer_phone ?? null,
      createdAt: order.created_at,
      itemLabels: labels.length > 0 ? labels : ["Registry item payment"],
      paystackReference: order.paystack_reference ?? null,
      paidAt: order.paid_at ?? null,
      status: order.status,
      totalAmount: Math.max(0, Number(order.total_amount ?? 0)),
      type: "item",
    };
  });

  const cashActivities = completedContributions.map<RegistryPaymentActivity>((contribution) => ({
    id: contribution.id,
    registryId: contribution.registry_id,
    buyerEmail: contribution.buyer_email,
    buyerMessage: contribution.buyer_message ?? null,
    buyerName: contribution.buyer_name,
    buyerPhone: contribution.buyer_phone ?? null,
    createdAt: contribution.created_at,
    itemLabels: ["General registry cash gift"],
    paystackReference: contribution.paystack_reference ?? null,
    paidAt: contribution.paid_at ?? null,
    status: contribution.status,
    totalAmount: Math.max(0, Number(contribution.amount ?? 0)),
    type: "cash",
  }));

  return [...itemActivities, ...cashActivities].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function formatCurrencyAmount(amount: number) {
  return formatNumberAmount(Math.max(0, Number(amount)));
}

function formatNumberAmount(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    style: "currency",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
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
    return "Surprise";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
