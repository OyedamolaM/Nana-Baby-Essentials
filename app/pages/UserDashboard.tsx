"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarIcon,
  Download,
  Gift,
  Home,
  Menu,
  Package,
  Pencil,
  Settings,
  Share2,
  Trash2,
  User,
} from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { formatNairaAmount, PRODUCT_LIST_SELECT } from "../../lib/commerce";
import {
  formatPaymentMethodLabel,
  formatPaymentReferenceDisplay,
} from "../../lib/orderPayments";
import { downloadOrderReceipt } from "../../lib/orderReceipt";
import {
  buildRegistryDashboardPath,
  buildRegistryPaymentActivities,
  getRegistryItemFundedAmount,
  getRegistryItemRemainingAmount,
  getRemainingRegistryQuantity,
  mapRegistryItemRecord,
  summarizeRegistryItems,
  type RegistryContributionRecord,
  type RegistryItem,
  type RegistryItemRecord,
  type RegistryOrderItemRecord,
  type RegistryOrderRecord,
  type RegistryPaymentActivity,
  type RegistrySummary,
} from "../../lib/registry";
import { normalizeShippingAddress, type ShippingAddress } from "../../lib/userProfile";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Calendar } from "../components/ui/calendar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { RegistryCreateModal } from "../components/registry/RegistryCreateModal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Separator } from "../components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../components/ui/utils";

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type UserOrder = {
  customer_email?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_pickup_code?: string | null;
  id: string;
  created_at: string;
  payment_method?: string | null;
  payment_reference?: string | null;
  pickup_code?: string | null;
  shipping_address?: Partial<ShippingAddress> | null;
  status: string;
  rider_pickup_code?: string | null;
  shipping_tier?: string | null;
  total: number;
  items: OrderItem[];
};

type UserProfile = {
  campaign_opt_out?: boolean | null;
  full_name?: string | null;
  phone?: string | null;
  shipping_address?: {
    address?: string;
    city?: string;
    name?: string;
    phone?: string;
    state?: string;
  } | null;
};

type RegistryRecord = {
  id: string;
  closed_at?: string | null;
  closed_note?: string | null;
  completed_at?: string | null;
  fulfillment_status?: "collecting" | "ready_for_shipping" | "shipped" | "completed" | null;
  fulfillment_updated_at?: string | null;
  name: string;
  ready_for_shipping_at?: string | null;
  share_code: string;
  shipped_at?: string | null;
  status?: string | null;
  due_month?: string | null;
  baby_gender?: string | null;
  created_at: string;
};

type TimedCacheEntry<T> = {
  cachedAt: number;
  data: T;
};

type ProfileDashboardData = {
  campaignOptOut: boolean;
  fullName: string;
  phone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
};

type RegistryDetailData = {
  registryItemsByRegistry: Record<string, RegistryItem[]>;
  registryPaymentActivities: Record<string, RegistryPaymentActivity[]>;
  registrySummaries: Record<string, RegistrySummary>;
};

type OrdersDashboardData = {
  cursor: string | null;
  hasMore: boolean;
  orders: UserOrder[];
  paidCount: number;
  unpaidCount: number;
};

type DashboardCacheEntry = {
  ordersByQuery?: Record<string, TimedCacheEntry<OrdersDashboardData>>;
  profile?: TimedCacheEntry<ProfileDashboardData>;
  registries?: TimedCacheEntry<RegistryRecord[]>;
  registryDetails?: Record<string, TimedCacheEntry<RegistryDetailData>>;
};

const dashboardCache = new Map<string, DashboardCacheEntry>();
const DASHBOARD_CACHE_STORAGE_PREFIX = "nbe:dashboard:";
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const DASHBOARD_PAGE_SIZE = 20;

function getDashboardCacheStorageKey(userId: string) {
  return `${DASHBOARD_CACHE_STORAGE_PREFIX}${userId}`;
}

function pruneDashboardCacheEntry(entry: DashboardCacheEntry) {
  const isFresh = (cached?: TimedCacheEntry<unknown>) =>
    Boolean(cached && Date.now() - Number(cached.cachedAt ?? 0) < DASHBOARD_CACHE_TTL_MS);
  return {
    profile: isFresh(entry.profile) ? entry.profile : undefined,
    registries: isFresh(entry.registries) ? entry.registries : undefined,
    ordersByQuery: Object.fromEntries(
      Object.entries(entry.ordersByQuery ?? {}).filter(([, cached]) => isFresh(cached)),
    ),
    registryDetails: Object.fromEntries(
      Object.entries(entry.registryDetails ?? {}).filter(([, cached]) => isFresh(cached)),
    ),
  } satisfies DashboardCacheEntry;
}

function hasDashboardCacheData(entry: DashboardCacheEntry) {
  return Boolean(
    entry.profile ||
    entry.registries ||
    Object.keys(entry.ordersByQuery ?? {}).length ||
    Object.keys(entry.registryDetails ?? {}).length
  );
}

function readDashboardCacheEntry(userId: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const memoryEntry = dashboardCache.get(userId);
  if (memoryEntry) {
    const normalized = pruneDashboardCacheEntry(memoryEntry);
    if (hasDashboardCacheData(normalized)) {
      dashboardCache.set(userId, normalized);
      return normalized;
    }
    dashboardCache.delete(userId);
  }

  try {
    const rawValue = window.sessionStorage.getItem(getDashboardCacheStorageKey(userId));
    if (!rawValue) {
      return undefined;
    }

    const parsed = JSON.parse(rawValue) as DashboardCacheEntry;
    const normalized = pruneDashboardCacheEntry(parsed);
    if (!hasDashboardCacheData(normalized)) {
      window.sessionStorage.removeItem(getDashboardCacheStorageKey(userId));
      return undefined;
    }
    dashboardCache.set(userId, normalized);
    return normalized;
  } catch {
    return undefined;
  }
}

function persistDashboardCacheEntry(userId: string, patch: Partial<DashboardCacheEntry>) {
  const entry = {
    ...(dashboardCache.get(userId) ?? readDashboardCacheEntry(userId) ?? {}),
    ...patch,
  };
  dashboardCache.set(userId, entry);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getDashboardCacheStorageKey(userId),
      JSON.stringify(entry),
    );
  } catch {
    // Ignore cache write failures and keep the in-memory cache.
  }
}

type OrderDateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "custom";

function createOrderQueryKey(
  status: "paid" | "unpaid",
  dateFilter: OrderDateFilter,
  range?: { from: string; to: string } | null,
) {
  return `${status}:${dateFilter}:${range?.from ?? "-"}:${range?.to ?? "-"}`;
}

function formatDueMonth(dueMonth?: string | null) {
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

function formatBabyGender(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  if (value === "neutral") {
    return "Surprise";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPickupCode(order: UserOrder) {
  return (
    order.pickup_code?.trim() ||
    order.customer_pickup_code?.trim() ||
    order.rider_pickup_code?.trim() ||
    null
  );
}

type DashboardTab = "home" | "orders" | "registries" | "account" | "settings";
type AccountSection = "profile" | "address";
type SettingsSection = "communication" | "security" | "account";

const CUSTOMER_NAVIGATION = [
  {
    id: "home",
    label: "Home",
    description: "Welcome and quick actions",
    icon: Home,
  },
  {
    id: "orders",
    label: "Orders",
    description: "Receipts and order history",
    icon: Package,
  },
  {
    id: "registries",
    label: "Registries",
    description: "Gifts and fulfilment",
    icon: Gift,
  },
  {
    id: "account",
    label: "Account",
    description: "Profile and delivery address",
    icon: User,
  },
  {
    id: "settings",
    label: "Settings",
    description: "Preferences and security",
    icon: Settings,
  },
] satisfies Array<{
  id: DashboardTab;
  label: string;
  description: string;
  icon: typeof Home;
}>;

function CustomerNavigation({
  activeSection,
  onSelect,
}: {
  activeSection: DashboardTab;
  onSelect: (section: DashboardTab) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="px-3 text-lg font-bold text-pink-600">My Dashboard</p>
      <nav aria-label="Customer dashboard sections" className="space-y-1">
        {CUSTOMER_NAVIGATION.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                isActive
                  ? "bg-pink-50 text-pink-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-950",
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs",
                    isActive ? "text-pink-600" : "text-gray-400",
                  )}
                >
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function getDashboardTabRoute(tab: DashboardTab) {
  switch (tab) {
    case "home":
      return "/dashboard";
    case "orders":
      return "/dashboard/orders";
    case "registries":
      return "/dashboard/registries";
    case "account":
      return "/dashboard/account";
    case "settings":
      return "/dashboard/settings";
    default:
      return "/dashboard";
  }
}

export function UserDashboard({
  initialTab = "home",
  initialAccountSection = "profile",
  initialSettingsSection = "communication",
}: {
  initialTab?: DashboardTab;
  initialAccountSection?: AccountSection;
  initialSettingsSection?: SettingsSection;
}) {
  const router = useRouter();
  const { user, session, signOut, updateProfile, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const cachedEntry = useMemo(
    () => (userId ? readDashboardCacheEntry(userId) : undefined),
    [userId],
  );
  const initialOrderQueryKey = createOrderQueryKey("paid", "all");
  const initialOrdersCache = cachedEntry?.ordersByQuery?.[initialOrderQueryKey]?.data;
  const cachedProfile = cachedEntry?.profile?.data;
  const [orders, setOrders] = useState<UserOrder[]>(initialOrdersCache?.orders ?? []);
  const [ordersCursor, setOrdersCursor] = useState<string | null>(initialOrdersCache?.cursor ?? null);
  const [ordersHasMore, setOrdersHasMore] = useState(initialOrdersCache?.hasMore ?? true);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);
  const [orderCounts, setOrderCounts] = useState({
    paid: initialOrdersCache?.paidCount ?? 0,
    unpaid: initialOrdersCache?.unpaidCount ?? 0,
  });
  const [registries, setRegistries] = useState<RegistryRecord[]>(cachedEntry?.registries?.data ?? []);
  const [registryItemsByRegistry, setRegistryItemsByRegistry] = useState<
    Record<string, RegistryItem[]>
  >({});
  const [registrySummaries, setRegistrySummaries] = useState<Record<string, RegistrySummary>>(
    {},
  );
  const [registryPaymentActivities, setRegistryPaymentActivities] = useState<
    Record<string, RegistryPaymentActivity[]>
  >({});
  const [loading, setLoading] = useState(Boolean(user && hasSupabaseEnv));

  const [fullName, setFullName] = useState(cachedProfile?.fullName ?? "");
  const [phone, setPhone] = useState(cachedProfile?.phone ?? "");
  const [campaignOptOut, setCampaignOptOut] = useState(cachedProfile?.campaignOptOut ?? false);

  const [shippingAddress, setShippingAddress] = useState(cachedProfile?.shippingAddress ?? "");
  const [shippingCity, setShippingCity] = useState(cachedProfile?.shippingCity ?? "");
  const [shippingState, setShippingState] = useState(cachedProfile?.shippingState ?? "");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registryCreateOpen, setRegistryCreateOpen] = useState(false);
  const [closeRegistryOpen, setCloseRegistryOpen] = useState(false);
  const [closingRegistry, setClosingRegistry] = useState<RegistryRecord | null>(null);
  const [closingRegistryNote, setClosingRegistryNote] = useState("");
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [savingRegistryStatus, setSavingRegistryStatus] = useState(false);
  const [savingCampaignPreference, setSavingCampaignPreference] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [accountSection, setAccountSection] = useState<AccountSection>(initialAccountSection);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>(initialSettingsSection);
  const [orderDateFilter, setOrderDateFilter] = useState<OrderDateFilter>("all");
  const [customOrderDateRange, setCustomOrderDateRange] = useState<DateRange | undefined>();
  const [orderCalendarOpen, setOrderCalendarOpen] = useState(false);
  const profileRequestIdRef = useRef(0);
  const ordersRequestIdRef = useRef(0);
  const registriesRequestIdRef = useRef(0);
  const registryDetailRequestIdsRef = useRef<Record<string, number>>({});
  const lastBackgroundRefreshRef = useRef(0);
  const [expandedRegistryIds, setExpandedRegistryIds] = useState<Set<string>>(new Set());
  const [loadingRegistryIds, setLoadingRegistryIds] = useState<Set<string>>(new Set());

  const loadProfile = useCallback(async (force = false) => {
    if (!userId) return;
    const cached = readDashboardCacheEntry(userId)?.profile;
    if (!force && cached) {
      const profile = cached.data;
      setFullName(profile.fullName);
      setPhone(profile.phone);
      setCampaignOptOut(profile.campaignOptOut);
      setShippingAddress(profile.shippingAddress);
      setShippingCity(profile.shippingCity);
      setShippingState(profile.shippingState);
      setLoading(false);
      return;
    }

    const requestId = ++profileRequestIdRef.current;
    const { data } = await supabase
      .from("user_profiles")
      .select("full_name, phone, campaign_opt_out, shipping_address")
      .eq("id", userId)
      .maybeSingle();
    if (profileRequestIdRef.current !== requestId) return;
    const typedProfile = (data as UserProfile | null) ?? null;
    const profile: ProfileDashboardData = {
      campaignOptOut: Boolean(typedProfile?.campaign_opt_out),
      fullName: typedProfile?.full_name ?? "",
      phone: typedProfile?.phone ?? "",
      shippingAddress: typedProfile?.shipping_address?.address ?? "",
      shippingCity: typedProfile?.shipping_address?.city ?? "",
      shippingState: typedProfile?.shipping_address?.state ?? "",
    };
    setFullName(profile.fullName);
    setPhone(profile.phone);
    setCampaignOptOut(profile.campaignOptOut);
    setShippingAddress(profile.shippingAddress);
    setShippingCity(profile.shippingCity);
    setShippingState(profile.shippingState);
    persistDashboardCacheEntry(userId, { profile: { cachedAt: Date.now(), data: profile } });
    setLoading(false);
  }, [userId]);

  const orderDateRange = useMemo(() => {
    if (orderDateFilter === "all") return null;

    if (orderDateFilter === "custom") {
      if (!customOrderDateRange?.from) return null;
      const from = new Date(
        customOrderDateRange.from.getFullYear(),
        customOrderDateRange.from.getMonth(),
        customOrderDateRange.from.getDate(),
      );
      const selectedTo = customOrderDateRange.to ?? customOrderDateRange.from;
      const to = new Date(
        selectedTo.getFullYear(),
        selectedTo.getMonth(),
        selectedTo.getDate() + 1,
      );
      return { from: from.toISOString(), to: to.toISOString() };
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    if (orderDateFilter === "today") {
      return { from: startOfToday.toISOString(), to: startOfTomorrow.toISOString() };
    }
    if (orderDateFilter === "yesterday") {
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      return { from: startOfYesterday.toISOString(), to: startOfToday.toISOString() };
    }
    if (orderDateFilter === "last7") {
      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      return { from: sevenDaysAgo.toISOString(), to: startOfTomorrow.toISOString() };
    }
    if (orderDateFilter === "thisMonth") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { from: startOfMonth.toISOString(), to: startOfNextMonth.toISOString() };
    }

    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: startOfLastMonth.toISOString(), to: startOfThisMonth.toISOString() };
  }, [customOrderDateRange, orderDateFilter]);

  const loadOrders = useCallback(async (reset = true, force = false) => {
    if (!userId || (!reset && ordersLoadingMore)) return;
    const queryKey = createOrderQueryKey("paid", orderDateFilter, orderDateRange);
    const cached = readDashboardCacheEntry(userId)?.ordersByQuery?.[queryKey];
    if (reset && !force && cached) {
      setOrders(cached.data.orders);
      setOrdersCursor(cached.data.cursor);
      setOrdersHasMore(cached.data.hasMore);
      setOrderCounts({ paid: cached.data.paidCount, unpaid: cached.data.unpaidCount });
      setLoading(false);
      return;
    }

    setOrdersLoadingMore(true);
    const requestId = ++ordersRequestIdRef.current;
    let query = supabase
      .from("orders")
      .select("id, created_at, status, total, items, payment_method, payment_reference, shipping_address, shipping_tier, customer_name, customer_email, customer_phone, pickup_code, customer_pickup_code, rider_pickup_code")
      .eq("user_id", userId)
      .eq("status", "paid");
    let paidCountQuery = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "paid");
    if (orderDateRange) {
      query = query.gte("created_at", orderDateRange.from).lt("created_at", orderDateRange.to);
      paidCountQuery = paidCountQuery.gte("created_at", orderDateRange.from).lt("created_at", orderDateRange.to);
    }
    if (!reset && ordersCursor) query = query.lt("created_at", ordersCursor);
    const [ordersResult, paidResult] = await Promise.all([
      query.order("created_at", { ascending: false }).limit(DASHBOARD_PAGE_SIZE + 1),
      reset ? paidCountQuery : Promise.resolve({ count: orderCounts.paid }),
    ]);
    if (ordersRequestIdRef.current !== requestId) return;
    const rows = (ordersResult.data ?? []) as UserOrder[];
    const pageRows = rows.slice(0, DASHBOARD_PAGE_SIZE);
    const nextOrders = reset ? pageRows : [...orders, ...pageRows];
    const nextData: OrdersDashboardData = {
      cursor: pageRows.at(-1)?.created_at ?? null,
      hasMore: rows.length > DASHBOARD_PAGE_SIZE,
      orders: nextOrders,
      paidCount: paidResult.count ?? 0,
      unpaidCount: 0,
    };
    setOrders(nextData.orders);
    setOrdersCursor(nextData.cursor);
    setOrdersHasMore(nextData.hasMore);
    setOrderCounts({ paid: nextData.paidCount, unpaid: nextData.unpaidCount });
    const currentCache = readDashboardCacheEntry(userId);
    persistDashboardCacheEntry(userId, {
      ordersByQuery: {
        ...(currentCache?.ordersByQuery ?? {}),
        [queryKey]: { cachedAt: Date.now(), data: nextData },
      },
    });
    setOrdersLoadingMore(false);
    setLoading(false);
  }, [
    orderCounts.paid,
    orderDateRange,
    orderDateFilter,
    orders,
    ordersCursor,
    ordersLoadingMore,
    userId,
  ]);

  const loadRegistries = useCallback(async (force = false) => {
    if (!userId) return;
    const cached = readDashboardCacheEntry(userId)?.registries;
    if (!force && cached) {
      setRegistries(cached.data);
      setLoading(false);
      return;
    }
    const requestId = ++registriesRequestIdRef.current;
    const { data } = await supabase
      .from("registries")
      .select("id, name, share_code, status, due_month, baby_gender, created_at, closed_at, closed_note, fulfillment_status, ready_for_shipping_at, shipped_at, completed_at, fulfillment_updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (registriesRequestIdRef.current !== requestId) return;
    const nextRegistries = (data ?? []) as RegistryRecord[];
    setRegistries(nextRegistries);
    persistDashboardCacheEntry(userId, {
      registries: { cachedAt: Date.now(), data: nextRegistries },
    });
    setLoading(false);
  }, [userId]);

  const loadRegistryDetail = useCallback(async (registryId: string, force = false) => {
    if (!userId) return;
    const cached = readDashboardCacheEntry(userId)?.registryDetails?.[registryId];
    if (!force && cached) {
      setRegistryItemsByRegistry((current) => ({ ...current, ...cached.data.registryItemsByRegistry }));
      setRegistrySummaries((current) => ({ ...current, ...cached.data.registrySummaries }));
      setRegistryPaymentActivities((current) => ({ ...current, ...cached.data.registryPaymentActivities }));
      return;
    }
    setLoadingRegistryIds((current) => new Set(current).add(registryId));
    const requestId = (registryDetailRequestIdsRef.current[registryId] ?? 0) + 1;
    registryDetailRequestIdsRef.current[registryId] = requestId;
    const [itemsResult, ordersResult, contributionsResult] = await Promise.all([
      supabase
        .from("registry_items")
        .select(`id, registry_id, product_id, requested_quantity, purchased_quantity, funded_amount, unit_price_snapshot, created_at, products(${PRODUCT_LIST_SELECT})`)
        .eq("registry_id", registryId)
        .order("created_at", { ascending: false }),
      supabase
        .from("registry_orders")
        .select("id, registry_id, buyer_name, buyer_email, buyer_phone, buyer_message, total_amount, contribution_type, status, paystack_reference, paid_at, created_at")
        .eq("registry_id", registryId)
        .order("created_at", { ascending: false }),
      supabase
        .from("registry_contributions")
        .select("id, registry_id, buyer_name, buyer_email, buyer_phone, buyer_message, amount, status, paystack_reference, paid_at, created_at")
        .eq("registry_id", registryId)
        .order("created_at", { ascending: false }),
    ]);
    if (registryDetailRequestIdsRef.current[registryId] !== requestId) return;
    const registryItems = ((itemsResult.data ?? []) as unknown as RegistryItemRecord[]).map(mapRegistryItemRecord);
    const registryOrders = (ordersResult.data ?? []) as unknown as RegistryOrderRecord[];
    const contributions = (contributionsResult.data ?? []) as unknown as RegistryContributionRecord[];
    const orderItemsResult = registryOrders.length
      ? await supabase
          .from("registry_order_items")
          .select("id, registry_order_id, registry_item_id, product_id, quantity, amount, created_at")
          .in("registry_order_id", registryOrders.map((order) => order.id))
      : { data: [] };
    if (registryDetailRequestIdsRef.current[registryId] !== requestId) return;
    const detail: RegistryDetailData = {
      registryItemsByRegistry: { [registryId]: registryItems },
      registrySummaries: { [registryId]: summarizeRegistryItems(registryItems) },
      registryPaymentActivities: {
        [registryId]: buildRegistryPaymentActivities({
          contributions,
          orderItems: (orderItemsResult.data ?? []) as unknown as RegistryOrderItemRecord[],
          orders: registryOrders,
          registryItems,
        }),
      },
    };
    setRegistryItemsByRegistry((current) => ({ ...current, ...detail.registryItemsByRegistry }));
    setRegistrySummaries((current) => ({ ...current, ...detail.registrySummaries }));
    setRegistryPaymentActivities((current) => ({ ...current, ...detail.registryPaymentActivities }));
    const currentCache = readDashboardCacheEntry(userId);
    persistDashboardCacheEntry(userId, {
      registryDetails: {
        ...(currentCache?.registryDetails ?? {}),
        [registryId]: { cachedAt: Date.now(), data: detail },
      },
    });
    setLoadingRegistryIds((current) => {
      const next = new Set(current);
      next.delete(registryId);
      return next;
    });
  }, [userId]);

  const toggleRegistryDetails = useCallback((registryId: string) => {
    setExpandedRegistryIds((current) => {
      const next = new Set(current);
      if (next.has(registryId)) {
        next.delete(registryId);
      } else {
        next.add(registryId);
        void loadRegistryDetail(registryId);
      }
      return next;
    });
  }, [loadRegistryDetail]);

  useEffect(() => {
    if (!userId || !hasSupabaseEnv) return;
    const timeoutId = window.setTimeout(() => {
      if (activeTab === "orders") void loadOrders(true);
      else if (activeTab === "registries") void loadRegistries();
      else void loadProfile();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeTab, loadOrders, loadProfile, loadRegistries, userId]);

  useEffect(() => {
    if (!userId || !hasSupabaseEnv) return;
    const refreshActiveResource = () => {
      const now = Date.now();
      if (now - lastBackgroundRefreshRef.current < DASHBOARD_CACHE_TTL_MS) return;
      lastBackgroundRefreshRef.current = now;
      if (activeTab === "orders") void loadOrders(true, true);
      else if (activeTab === "registries") void loadRegistries(true);
      else void loadProfile(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshActiveResource();
    };
    window.addEventListener("focus", refreshActiveResource);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshActiveResource);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeTab, loadOrders, loadProfile, loadRegistries, userId]);

  const handleShareRegistry = async (registry: RegistryRecord) => {
    const shareUrl = `${window.location.origin}/registry/${registry.share_code}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: registry.name,
          text: "Check out my baby registry!",
          url: shareUrl,
        });
        return;
      } catch {
        // Fall back to clipboard below.
      }
    }

    await navigator.clipboard.writeText(shareUrl);
    toast.success("Registry link copied to clipboard!");
  };

  const handleUpdateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const { error } = await updateProfile({
      full_name: fullName,
      phone,
    });

    if (error) {
      toast.error("Failed to update profile.");
      return false;
    }

    toast.success("Profile updated successfully.");
    await loadProfile(true);
    return true;
  };

  const handleUpdateAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    const { error } = await updateProfile({
      shipping_address: {
        name: fullName,
        phone,
        address: shippingAddress,
        city: shippingCity,
        state: shippingState,
      },
    });

    if (error) {
      toast.error(error.message || "Failed to update address.");
    } else {
      toast.success("Address updated successfully.");
      await loadProfile(true);
    }
  };

  const handleToggleCampaignEmails = async (nextOptOut: boolean) => {
    setSavingCampaignPreference(true);

    const { error } = await updateProfile({
      campaign_opt_out: nextOptOut,
    });

    setSavingCampaignPreference(false);

    if (error) {
      toast.error("Could not update your campaign email preference.");
      return;
    }

    setCampaignOptOut(nextOptOut);
    toast.success(
      nextOptOut
        ? "You will no longer receive customer campaigns."
        : "Customer campaigns are turned back on for your account.",
    );
    await loadProfile(true);
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) {
      toast.error("Please sign in again before changing your password.");
      return;
    }

    if (!oldPassword) {
      toast.error("Enter your current password first.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    const email = user.email?.trim() ?? "";
    if (!email) {
      toast.error("This account does not have an email address yet.");
      return;
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: oldPassword,
    });

    if (reauthError) {
      toast.error("Your current password is incorrect.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      toast.error("Failed to change password.");
    } else {
      toast.success("Password changed successfully.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleDeleteAccount = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete your account? This action cannot be undone.",
      )
    ) {
      return;
    }

    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    const { error } = await supabase.rpc("delete_user");

    if (error) {
      toast.error("Failed to delete account.");
    } else {
      toast.success("Account deleted.");
      await signOut();
    }
  };

  const handleOpenCloseRegistry = (registry: RegistryRecord) => {
    setClosingRegistry(registry);
    setClosingRegistryNote(registry.closed_note ?? "");
    setCloseRegistryOpen(true);
  };

  const handleConfirmCloseRegistry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!closingRegistry) {
      return;
    }

    const note = closingRegistryNote.trim();
    if (!note) {
      toast.error("Add a short note explaining why you are closing this registry.");
      return;
    }

    setSavingRegistryStatus(true);

    const { error } = await supabase
      .from("registries")
      .update({
        closed_at: new Date().toISOString(),
        closed_note: note,
        status: "closed",
      })
      .eq("id", closingRegistry.id);

    setSavingRegistryStatus(false);

    if (error) {
      toast.error("Could not close this registry.");
      return;
    }

    toast.success("Registry closed.");
    setCloseRegistryOpen(false);
    setClosingRegistry(null);
    setClosingRegistryNote("");
    await loadRegistries(true);
  };

  const handleReopenRegistry = async (registry: RegistryRecord) => {
    setSavingRegistryStatus(true);

    const { error } = await supabase
      .from("registries")
      .update({
        closed_at: null,
        status: "active",
      })
      .eq("id", registry.id);

    setSavingRegistryStatus(false);

    if (error) {
      toast.error("Could not reopen this registry.");
      return;
    }

    toast.success("Registry reopened.");
    await loadRegistries(true);
  };

  const handleRegistryFulfillment = async (
    registry: RegistryRecord,
    status: "collecting" | "ready_for_shipping" | "completed",
  ) => {
    if (
      status === "ready_for_shipping" &&
      !window.confirm(
        "Mark this registry ready for shipping? It will close to new gifts and use your saved address.",
      )
    ) {
      return;
    }

    const accessToken =
      session?.access_token ||
      (await supabase.auth.getSession()).data.session?.access_token ||
      "";
    if (!accessToken) {
      toast.error("Sign in again to update this registry.");
      return;
    }

    setSavingRegistryStatus(true);
    try {
      const response = await fetch(`/api/registry/${registry.id}/fulfillment`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message || "Registry fulfilment status could not be updated.");
        return;
      }

      toast.success(result?.message || "Registry updated.");
      await loadRegistries(true);
    } catch (error) {
      console.error("Failed to update registry fulfilment.", error);
      toast.error("Registry fulfilment status could not be updated.");
    } finally {
      setSavingRegistryStatus(false);
    }
  };

  const renderOrders = (items: UserOrder[], emptyMessage: string) => {
    if (items.length === 0) {
      return <p className="text-gray-500">{emptyMessage}</p>;
    }

    return (
      <div className="space-y-4">
        {items.map((order) => {
          const pickupCode = getPickupCode(order);
          return (
          <div key={order.id} className="rounded-lg border p-4">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="font-semibold">Order #{order.id.substring(0, 8)}</p>
                <p className="text-sm text-gray-500">
                  {formatDateTime(order.created_at)}
                </p>
                <div className="space-y-1 text-xs text-gray-500">
                  {order.shipping_tier ? <p>{order.shipping_tier}</p> : null}
                  <p>
                    Payment: {" "}
                    {formatPaymentMethodLabel(
                      order.payment_method,
                      order.payment_reference,
                    )}
                  </p>
                  {order.payment_reference ? (
                    <p title={order.payment_reference}>
                      Reference: {formatPaymentReferenceDisplay(order.payment_reference)}
                    </p>
                  ) : null}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm ${
                  order.status === "paid"
                    ? "bg-green-100 text-green-700"
                    : order.status === "pending" || order.status === "awaiting_payment"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {order.status}
              </span>
            </div>
            {pickupCode ? (
              <>
                <Separator className="my-2" />
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                  <p className="font-semibold">Pickup code: {pickupCode}</p>
                  <p className="mt-1 text-xs">
                    Share this code with the rider or pickup attendant only when receiving
                    your order.
                  </p>
                </div>
              </>
            ) : null}
            <Separator className="my-2" />
            <div className="space-y-1">
              {order.items?.map((item, index) => (
                <div
                  key={`${order.id}-${index}`}
                  className="flex justify-between text-sm"
                >
                  <span>
                    {item.name} x {item.quantity}
                  </span>
                  <span>{formatNairaAmount(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatNairaAmount(order.total)}</span>
            </div>
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadOrderReceipt({
                    createdAt: order.created_at,
                    customerEmail: order.customer_email,
                    customerName: order.customer_name,
                    customerPhone: order.customer_phone,
                    customerPickupCode: order.customer_pickup_code,
                    id: order.id,
                    items: order.items,
                    paymentMethod: order.payment_method,
                    paymentReference: order.payment_reference,
                    pickupCode,
                    riderPickupCode: order.rider_pickup_code,
                    shippingAddress: normalizeShippingAddress(order.shipping_address),
                    shippingTier: order.shipping_tier,
                    status: order.status,
                    total: Number(order.total ?? 0),
                  })
                }
              >
                <Download className="h-4 w-4" />
                Download Receipt
              </Button>
            </div>
          </div>
          );
        })}
      </div>
    );
  };

  const handleTabChange = (nextTab: string) => {
    const normalizedTab = nextTab as DashboardTab;
    setActiveTab(normalizedTab);
    setMobileNavigationOpen(false);

    if (typeof window !== "undefined") {
      const nextRoute = getDashboardTabRoute(normalizedTab);
      if (window.location.pathname !== nextRoute) {
        window.history.replaceState(window.history.state, "", nextRoute);
      }
    }
  };

  const hasCompleteProfile = Boolean(
    fullName.trim() &&
      phone.trim() &&
      shippingAddress.trim() &&
      shippingCity.trim() &&
      shippingState.trim(),
  );

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Loading your dashboard...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">
          Please sign in to view your dashboard.
        </p>
      </div>
    );
  }

  if (!hasSupabaseEnv) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">
          Connect Supabase to enable orders, registries, profile updates, and
          saved addresses.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="mb-4 lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMobileNavigationOpen(true)}
            aria-label="Open dashboard navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
          <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>My Dashboard</SheetTitle>
            </SheetHeader>
            <div className="px-3 py-5">
              <CustomerNavigation activeSection={activeTab} onSelect={handleTabChange} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border bg-white p-3 shadow-sm lg:block">
            <CustomerNavigation activeSection={activeTab} onSelect={handleTabChange} />
          </aside>

          <main className="min-w-0">
            <div className="min-h-[55vh]">
          <TabsContent value="home">
            <div className="space-y-6">
              <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-pink-600 to-pink-500 px-6 py-8 text-white sm:px-8">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-pink-100">
                  Welcome back
                </p>
                <h2 className="mt-2 text-3xl font-bold">
                  {fullName ? fullName.split(" ")[0] : "Welcome"}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-pink-50">
                  Manage your orders, registries, delivery details, and account preferences
                  from one place.
                </p>
              </div>

              <div className={cn("grid gap-4", !hasCompleteProfile && "sm:grid-cols-2")}>
                {!hasCompleteProfile ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Complete Your Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <span className="text-sm text-gray-600">Full name</span>
                      <span
                        className={`text-sm font-semibold ${
                          fullName.trim() ? "text-green-700" : "text-amber-700"
                        }`}
                      >
                        {fullName.trim() ? "Saved" : "Required"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <span className="text-sm text-gray-600">Phone number</span>
                      <span className={`text-sm font-semibold ${phone.trim() ? "text-green-700" : "text-amber-700"}`}>
                        {phone.trim() ? "Saved" : "Required"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <span className="text-sm text-gray-600">Delivery address</span>
                      <span
                        className={`text-sm font-semibold ${
                          shippingAddress && shippingCity && shippingState
                            ? "text-green-700"
                            : "text-amber-700"
                        }`}
                      >
                        {shippingAddress && shippingCity && shippingState
                          ? "Ready"
                          : "Incomplete"}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setAccountSection(
                          fullName.trim() && phone.trim() ? "address" : "profile",
                        );
                        handleTabChange("account");
                      }}
                    >
                      Complete Profile
                    </Button>
                  </CardContent>
                </Card>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Button onClick={() => handleTabChange("orders")}>
                      View Orders
                    </Button>
                    <Button variant="outline" onClick={() => handleTabChange("registries")}>
                      Manage Registries
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/products">Continue Shopping</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
                <CardTitle>Order History</CardTitle>
                <div className="w-36 sm:w-48">
                  <Label htmlFor="dashboard-order-date-filter" className="sr-only">
                    Filter orders by date
                  </Label>
                  <Select
                    value={orderDateFilter}
                    onValueChange={(value) => setOrderDateFilter(value as OrderDateFilter)}
                  >
                    <SelectTrigger id="dashboard-order-date-filter" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Orders</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="last7">Last 7 Days</SelectItem>
                      <SelectItem value="thisMonth">This Month</SelectItem>
                      <SelectItem value="lastMonth">Last Month</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {orderDateFilter === "custom" ? (
                  <div className="order-last w-full space-y-1 sm:ml-auto sm:w-72">
                    <Label>Custom Range</Label>
                    <Popover open={orderCalendarOpen} onOpenChange={setOrderCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {customOrderDateRange?.from ? (
                            customOrderDateRange.to ? (
                              <>
                                {format(customOrderDateRange.from, "PPP")} -{" "}
                                {format(customOrderDateRange.to, "PPP")}
                              </>
                            ) : (
                              format(customOrderDateRange.from, "PPP")
                            )
                          ) : (
                            "Select dates"
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-auto p-0">
                        <Calendar
                          mode="range"
                          selected={customOrderDateRange}
                          onSelect={(range) => {
                            setCustomOrderDateRange(range);
                            if (range?.from && range?.to) {
                              setOrderCalendarOpen(false);
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                {renderOrders(orders, "No orders yet.")}
                {ordersHasMore ? (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="outline"
                      disabled={ordersLoadingMore}
                      onClick={() => void loadOrders(false, true)}
                    >
                      {ordersLoadingMore ? "Loading..." : "Load more orders"}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registries">
            <div className="space-y-6">
              <Card>
              <CardHeader className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>My Registries</CardTitle>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto">
                  <Button asChild variant="outline" className="px-2 text-xs sm:px-4 sm:text-sm">
                    <Link href="/registry/products">Browse Registry Catalog</Link>
                  </Button>
                  <Button
                    className="px-2 text-xs sm:px-4 sm:text-sm"
                    onClick={() => setRegistryCreateOpen(true)}
                  >
                    <Gift className="mr-1.5 h-4 w-4" />
                    New Registry
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {registries.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="mb-4 text-gray-500">No registries yet.</p>
                    <Button onClick={() => setRegistryCreateOpen(true)}>Create Your First Registry</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {registries.map((registry) => {
                      const summary = registrySummaries[registry.id] ?? {
                        fundedAmount: 0,
                        requested: 0,
                        purchased: 0,
                        remainingAmount: 0,
                        remainingQuantity: 0,
                        totalNeededAmount: 0,
                      };
                      const registryItems = registryItemsByRegistry[registry.id] ?? [];
                      const payments = registryPaymentActivities[registry.id] ?? [];
                      const detailsExpanded = expandedRegistryIds.has(registry.id);
                      const detailsLoading = loadingRegistryIds.has(registry.id);

                      return (
                        <div key={registry.id} className="rounded-xl border p-3 sm:p-4">
                          <div className="mb-2 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                              <p className="font-semibold sm:text-lg">
                                {registry.name}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-gray-500 sm:text-sm">
                                Due {formatDueMonth(registry.due_month)}
                                {" · "}
                                {formatBabyGender(registry.baby_gender)}
                                {" · "}
                                Created {new Date(registry.created_at).toLocaleDateString()}
                              </p>
                              {registry.status === "closed" ? (
                                <p className="mt-2 inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-700">
                                  Closed
                                </p>
                              ) : null}
                              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center sm:gap-2">
                                <div className="rounded-xl bg-gray-50 px-1.5 py-2 sm:px-3">
                                  <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
                                    Requested
                                  </span>
                                  <span className="mt-0.5 block text-sm font-bold text-gray-900">
                                    {summary.requested}
                                  </span>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-1.5 py-2 sm:px-3">
                                  <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
                                    Gifted
                                  </span>
                                  <span className="mt-0.5 block text-sm font-bold text-gray-900">
                                    {summary.purchased}
                                  </span>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-1.5 py-2 sm:px-3">
                                  <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
                                    Remaining
                                  </span>
                                  <span className="mt-0.5 block text-sm font-bold text-gray-900">
                                    {summary.remainingQuantity}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="grid w-full grid-cols-3 gap-2 xl:flex xl:w-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                className="px-2 text-xs sm:text-sm"
                                onClick={() => handleShareRegistry(registry)}
                              >
                                <Share2 className="mr-1 h-4 w-4" />
                                Share
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="px-2 text-xs sm:text-sm"
                                disabled={detailsLoading}
                                onClick={() => toggleRegistryDetails(registry.id)}
                              >
                                {detailsLoading
                                  ? "Loading..."
                                  : detailsExpanded
                                    ? "Hide"
                                    : "Summary"}
                              </Button>
                              <Button asChild size="sm" className="px-2 text-xs sm:text-sm">
                                <Link href={buildRegistryDashboardPath(registry)}>
                                  Open
                                </Link>
                              </Button>
                            </div>
                          </div>
                          <Separator className="my-2" />
                          <div className="rounded-xl bg-gray-50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-500">
                                  Registry Code
                                </p>
                                <p className="truncate font-mono text-base font-bold text-pink-600 sm:text-lg">
                                  {registry.share_code}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold capitalize text-gray-700 sm:text-xs">
                                {(registry.fulfillment_status ?? "collecting").replaceAll("_", " ")}
                              </span>
                            </div>
                            {registry.closed_note ? (
                              <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-gray-600 sm:text-sm">
                                Closing note: {registry.closed_note}
                              </p>
                            ) : null}
                          </div>
                          {detailsExpanded && (
                          <Tabs defaultValue="funding" className="mt-4 space-y-4">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="funding" className="cursor-pointer">
                                Item Funding
                              </TabsTrigger>
                              <TabsTrigger value="payments" className="cursor-pointer">
                                Payment Activity
                              </TabsTrigger>
                            </TabsList>

                            <TabsContent value="funding" className="space-y-3">
                              <div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2">
                                <div className="rounded-xl bg-gray-50 px-1 py-2 text-xs sm:px-3 sm:text-sm">
                                  <span className="block font-semibold text-gray-900">
                                    Needed
                                  </span>
                                  <span className="block text-[10px] sm:text-sm">
                                    {formatNairaAmount(summary.totalNeededAmount)}
                                  </span>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-1 py-2 text-xs sm:px-3 sm:text-sm">
                                  <span className="block font-semibold text-gray-900">
                                    Funded
                                  </span>
                                  <span className="block text-[10px] sm:text-sm">
                                    {formatNairaAmount(summary.fundedAmount)}
                                  </span>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-1 py-2 text-xs sm:px-3 sm:text-sm">
                                  <span className="block font-semibold text-gray-900">
                                    Left
                                  </span>
                                  <span className="block text-[10px] sm:text-sm">
                                    {formatNairaAmount(summary.remainingAmount)}
                                  </span>
                                </div>
                              </div>

                              {registryItems.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                  No registry items yet.
                                </p>
                              ) : (
                                registryItems.slice(0, 3).map((item) => (
                                  <div
                                    key={item.id}
                                    className="rounded-xl border border-gray-200 px-3 py-3"
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="font-medium text-gray-900">
                                          {item.product?.name ?? "Registry item"}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                          {item.purchasedQuantity} covered,{" "}
                                          {getRemainingRegistryQuantity(item)} units left
                                        </p>
                                      </div>
                                      <div className="text-sm text-gray-600 sm:text-right">
                                        <p>
                                          Funded:{" "}
                                          {formatNairaAmount(getRegistryItemFundedAmount(item))}
                                        </p>
                                        <p>
                                          Left:{" "}
                                          {formatNairaAmount(getRegistryItemRemainingAmount(item))}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </TabsContent>

                            <TabsContent value="payments" className="space-y-3">
                              {payments.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                  No payments for this registry yet.
                                </p>
                              ) : (
                                payments.slice(0, 3).map((payment) => (
                                  <div
                                    key={payment.id}
                                    className="rounded-xl border border-gray-200 px-3 py-3"
                                  >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="font-medium text-gray-900">
                                          {payment.buyerName}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                          {payment.buyerEmail}
                                          {payment.buyerPhone ? ` | ${payment.buyerPhone}` : ""}
                                        </p>
                                      </div>
                                      <div className="text-sm text-gray-600 sm:text-right">
                                        <p className="font-semibold text-gray-900">
                                          {formatNairaAmount(payment.totalAmount)}
                                        </p>
                                        <p>{formatDateTime(payment.paidAt ?? payment.createdAt)}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </TabsContent>
                          </Tabs>
                          )}

                          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="w-full px-2 text-xs sm:w-auto sm:text-sm"
                            >
                               <Link href={buildRegistryDashboardPath(registry)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                 Edit Registry
                               </Link>
                             </Button>
                             {(registry.fulfillment_status ?? "collecting") === "collecting" ? (
                               <>
                                 <Button
                                   size="sm"
                                   className="w-full px-2 text-xs sm:w-auto sm:text-sm"
                                   onClick={() =>
                                     void handleRegistryFulfillment(
                                       registry,
                                       "ready_for_shipping",
                                     )
                                   }
                                   disabled={savingRegistryStatus}
                                 >
                                   Ready for Shipping
                                 </Button>
                                 {registry.status === "closed" ? (
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     className="w-full px-2 text-xs sm:w-auto sm:text-sm"
                                     onClick={() => void handleReopenRegistry(registry)}
                                     disabled={savingRegistryStatus}
                                   >
                                     Reopen Registry
                                   </Button>
                                 ) : (
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     className="w-full px-2 text-xs sm:w-auto sm:text-sm"
                                     onClick={() => handleOpenCloseRegistry(registry)}
                                     disabled={savingRegistryStatus}
                                   >
                                     Close Registry
                                   </Button>
                                 )}
                               </>
                             ) : null}
                             {registry.fulfillment_status === "ready_for_shipping" ? (
                               <Button
                                 variant="outline"
                                 size="sm"
                                 className="w-full px-2 text-xs sm:w-auto sm:text-sm"
                                 onClick={() =>
                                   void handleRegistryFulfillment(registry, "collecting")
                                 }
                                 disabled={savingRegistryStatus}
                               >
                                 Continue Collecting
                               </Button>
                             ) : null}
                             {registry.fulfillment_status === "shipped" ? (
                               <Button
                                 size="sm"
                                 className="w-full px-2 text-xs sm:w-auto sm:text-sm"
                                 onClick={() =>
                                   void handleRegistryFulfillment(registry, "completed")
                                 }
                                 disabled={savingRegistryStatus}
                               >
                                 Confirm Delivery
                               </Button>
                             ) : null}
                           </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              </Card>

            </div>
          </TabsContent>

          <TabsContent value="account">
            <Tabs
              value={accountSection}
              onValueChange={(value) => setAccountSection(value as AccountSection)}
              className="space-y-6"
            >
              <TabsList className="grid h-auto w-full grid-cols-2">
                <TabsTrigger value="profile" className="cursor-pointer py-3">
                  Personal Information
                </TabsTrigger>
                <TabsTrigger value="address" className="cursor-pointer py-3">
                  Delivery Address
                </TabsTrigger>
              </TabsList>
              <TabsContent value="profile">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Personal Information</CardTitle>
                  </div>
                  <Button variant="outline" onClick={() => setProfileEditOpen(true)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Profile
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                      Email
                    </p>
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {user.email || "No email saved"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                      Full Name
                    </p>
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {fullName || "No name saved"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-4 py-3 sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                      Phone
                    </p>
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {phone || "No phone number saved"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              </TabsContent>

              <TabsContent value="address">
            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateAddress} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Street Address</Label>
                    <Input
                      id="address"
                      value={shippingAddress}
                      onChange={(event) => setShippingAddress(event.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={shippingCity}
                        onChange={(event) => setShippingCity(event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={shippingState}
                        onChange={(event) => setShippingState(event.target.value)}
                      />
                    </div>
                  </div>

                  <Button type="submit">Save Address</Button>
                </form>
              </CardContent>
            </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="settings">
            <Tabs
              value={settingsSection}
              onValueChange={(value) => setSettingsSection(value as SettingsSection)}
              className="space-y-6"
            >
              <TabsList className="grid h-auto w-full grid-cols-3">
                <TabsTrigger value="communication" className="cursor-pointer px-2 py-3 text-xs sm:text-sm">
                  Communication
                </TabsTrigger>
                <TabsTrigger value="security" className="cursor-pointer px-2 py-3 text-xs sm:text-sm">
                  Security
                </TabsTrigger>
                <TabsTrigger value="account" className="cursor-pointer px-2 py-3 text-xs sm:text-sm">
                  Account
                </TabsTrigger>
              </TabsList>

              <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="old-password">Current Password</Label>
                    <Input
                      id="old-password"
                      type="password"
                      value={oldPassword}
                      onChange={(event) => setOldPassword(event.target.value)}
                      minLength={6}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={6}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      minLength={6}
                    />
                  </div>

                  <Button type="submit">Change Password</Button>
                </form>
              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="communication">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Emails</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {campaignOptOut ? "Campaign emails turned off" : "Campaign emails turned on"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {campaignOptOut
                        ? "You will stop receiving promotional customer campaigns until you turn them back on."
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant={campaignOptOut ? "default" : "outline"}
                    disabled={savingCampaignPreference}
                    onClick={() => void handleToggleCampaignEmails(!campaignOptOut)}
                  >
                    {savingCampaignPreference
                      ? "Saving..."
                      : campaignOptOut
                        ? "Turn Campaigns Back On"
                        : "Opt Out of Campaigns"}
                  </Button>
                </div>
              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="account">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600">Danger Zone</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-gray-600">
                  Once you delete your account, there is no going back. Please
                  be certain.
                </p>
                <Button variant="destructive" onClick={handleDeleteAccount}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </CardContent>
            </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
            </div>
          </main>
        </div>
      </Tabs>

      <RegistryCreateModal
        open={registryCreateOpen}
        onOpenChange={setRegistryCreateOpen}
        onCreated={(registry) => {
          void loadRegistries(true);
          router.push(registry.dashboardPath);
        }}
      />

      <Dialog open={profileEditOpen} onOpenChange={setProfileEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={async (event) => {
              const didSave = await handleUpdateProfile(event);
              if (didSave) {
                setProfileEditOpen(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={user.email} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-full-name">Full Name</Label>
              <Input
                id="profile-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>

            <Button type="submit" className="w-full">
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={closeRegistryOpen} onOpenChange={setCloseRegistryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Close Registry</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleConfirmCloseRegistry} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="close-registry-note">Why are you closing this registry?</Label>
              <Textarea
                id="close-registry-note"
                rows={4}
                value={closingRegistryNote}
                onChange={(event) => setClosingRegistryNote(event.target.value)}
                placeholder="Add a short note for your records."
                required
              />
            </div>

            <Button type="submit" variant="destructive" className="w-full" disabled={savingRegistryStatus}>
              {savingRegistryStatus ? "Saving..." : "Close Registry"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
