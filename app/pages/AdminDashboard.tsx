"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  DollarSign,
  Edit,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSlug,
  type BlogPostRecord,
  type HomeDealRecord,
} from "../../lib/content";
import {
  createProductSlug,
  formatNaira,
  formatNairaAmount,
  getProductCostPrice,
  getProductSellingPrice,
  toNairaAmount,
  type ProductRecord,
} from "../../lib/commerce";
import { normalizeShippingAddress } from "../../lib/userProfile";
import {
  buildRegistryPaymentActivities,
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
import {
  buildProductCategoryOptions,
  extractAssignedCategoryLabel,
  normalizeProductCategoryLabels,
  type ProductCategoryAssignmentRecord,
  type ProductCategoryRecord,
} from "../../lib/productCategories";
import {
  AdminCampaignManager,
  type CampaignContactRecord,
} from "../components/admin/AdminCampaignManager";
import { AdminOrdersManager, type AdminOrderRecord } from "../components/admin/AdminOrdersManager";
import { AdminProductCategoriesManager } from "../components/admin/AdminProductCategoriesManager";
import { AdminRegistryAccountsManager } from "../components/admin/AdminRegistryAccountsManager";
import { AdminRegistryOrdersManager } from "../components/admin/AdminRegistryOrdersManager";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";

type Customer = {
  id: string;
  account_status?: string | null;
  campaign_opt_out?: boolean | null;
  full_name?: string | null;
  deleted_at?: string | null;
  email?: string | null;
  phone?: string | null;
  shipping_address?: {
    address?: string;
    city?: string;
    name?: string;
    phone?: string;
    state?: string;
  } | null;
  created_at: string;
};

type RegistryRecord = {
  id: string;
  user_id: string;
  name: string;
  due_month?: string | null;
  baby_gender?: string | null;
  share_code: string;
  created_at: string;
};

type NewsletterSubscriber = {
  id: string;
  email: string;
  source?: string | null;
  is_active: boolean;
  created_at: string;
  last_sent_at?: string | null;
};

type NewsletterCampaign = {
  campaign_type?: string | null;
  id: string;
  subject: string;
  status: string;
  recipient_count: number;
  created_at: string;
  sent_at?: string | null;
};

type ShippingTier = {
  id: string;
  code: string;
  label: string;
  fee: number;
  eta?: string | null;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
};

type AdminDashboardCacheEntry = {
  blogPosts: BlogPostRecord[];
  campaignContacts: CampaignContactRecord[];
  customers: Customer[];
  deals: HomeDealRecord[];
  newsletterCampaigns: NewsletterCampaign[];
  newsletterSubscribers: NewsletterSubscriber[];
  orders: AdminOrderRecord[];
  productCategories: ProductCategoryRecord[];
  products: ProductRecord[];
  registries: RegistryRecord[];
  registryItemsByRegistry: Record<string, RegistryItem[]>;
  registryOrderItemsByOrder: Record<string, RegistryOrderItemRecord[]>;
  registryOrders: RegistryOrderRecord[];
  registryPaymentActivities: Record<string, RegistryPaymentActivity[]>;
  registrySummaries: Record<string, RegistrySummary>;
  shippingTiers: ShippingTier[];
};

const ADMIN_DASHBOARD_CACHE_STORAGE_PREFIX = "nbe:admin-dashboard:";
const adminDashboardCache = new Map<string, AdminDashboardCacheEntry>();

function getAdminDashboardCacheStorageKey(userId: string) {
  return `${ADMIN_DASHBOARD_CACHE_STORAGE_PREFIX}${userId}`;
}

function readAdminDashboardCacheEntry(userId: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const memoryEntry = adminDashboardCache.get(userId);
  if (memoryEntry) {
    return memoryEntry;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      getAdminDashboardCacheStorageKey(userId),
    );
    if (!rawValue) {
      return undefined;
    }

    const parsed = JSON.parse(rawValue) as AdminDashboardCacheEntry;
    adminDashboardCache.set(userId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function persistAdminDashboardCacheEntry(
  userId: string,
  entry: AdminDashboardCacheEntry,
) {
  adminDashboardCache.set(userId, entry);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getAdminDashboardCacheStorageKey(userId),
      JSON.stringify(entry),
    );
  } catch {
    // Ignore storage failures and keep the in-memory cache.
  }
}

function formatDate(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

function getDealStatusLabel(deal: HomeDealRecord) {
  if (!deal.is_active) {
    return "Inactive";
  }

  const now = Date.now();
  const startsAt = deal.starts_at ? new Date(deal.starts_at).getTime() : null;
  const endsAt = deal.ends_at ? new Date(deal.ends_at).getTime() : null;

  if (startsAt && !Number.isNaN(startsAt) && startsAt > now) {
    return "Scheduled";
  }

  if (endsAt && !Number.isNaN(endsAt) && endsAt <= now) {
    return "Ended";
  }

  return "Live";
}

function buildAssignedProductCategoriesByProductId(
  assignments: ProductCategoryAssignmentRecord[],
) {
  return assignments.reduce<Record<number, string[]>>((accumulator, assignment) => {
    const label = extractAssignedCategoryLabel(assignment);
    if (!label) {
      return accumulator;
    }

    const productId = Number(assignment.product_id);
    const existing = accumulator[productId] ?? [];
    existing.push(label);
    accumulator[productId] = existing;
    return accumulator;
  }, {});
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function AdminDashboard() {
  const { user, session, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const cachedAdminEntry = useMemo(
    () => (userId ? readAdminDashboardCacheEntry(userId) : undefined),
    [userId],
  );
  const [loading, setLoading] = useState(Boolean(userId && !cachedAdminEntry));
  const [adminAccessStatus, setAdminAccessStatus] = useState<
    "checking" | "allowed" | "denied"
  >(cachedAdminEntry ? "allowed" : "checking");
  const initialAdminLoadKeyRef = useRef<string | null>(null);
  const [orders, setOrders] = useState<AdminOrderRecord[]>(cachedAdminEntry?.orders ?? []);
  const [customers, setCustomers] = useState<Customer[]>(cachedAdminEntry?.customers ?? []);
  const [products, setProducts] = useState<ProductRecord[]>(cachedAdminEntry?.products ?? []);
  const [registries, setRegistries] = useState<RegistryRecord[]>(cachedAdminEntry?.registries ?? []);
  const [registryOrders, setRegistryOrders] = useState<RegistryOrderRecord[]>(
    cachedAdminEntry?.registryOrders ?? [],
  );
  const [registryOrderItemsByOrder, setRegistryOrderItemsByOrder] = useState<
    Record<string, RegistryOrderItemRecord[]>
  >(cachedAdminEntry?.registryOrderItemsByOrder ?? {});
  const [registryItemsByRegistry, setRegistryItemsByRegistry] = useState<
    Record<string, RegistryItem[]>
  >(cachedAdminEntry?.registryItemsByRegistry ?? {});
  const [registrySummaries, setRegistrySummaries] = useState<Record<string, RegistrySummary>>(
    cachedAdminEntry?.registrySummaries ?? {},
  );
  const [registryPaymentActivities, setRegistryPaymentActivities] = useState<
    Record<string, RegistryPaymentActivity[]>
  >(cachedAdminEntry?.registryPaymentActivities ?? {});
  const [deals, setDeals] = useState<HomeDealRecord[]>(cachedAdminEntry?.deals ?? []);
  const [blogPosts, setBlogPosts] = useState<BlogPostRecord[]>(cachedAdminEntry?.blogPosts ?? []);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<
    NewsletterSubscriber[]
  >(cachedAdminEntry?.newsletterSubscribers ?? []);
  const [newsletterCampaigns, setNewsletterCampaigns] = useState<
    NewsletterCampaign[]
  >(cachedAdminEntry?.newsletterCampaigns ?? []);
  const [campaignContacts, setCampaignContacts] = useState<CampaignContactRecord[]>(
    cachedAdminEntry?.campaignContacts ?? [],
  );
  const [productCategories, setProductCategories] = useState<ProductCategoryRecord[]>(
    cachedAdminEntry?.productCategories ?? [],
  );
  const [shippingTiers, setShippingTiers] = useState<ShippingTier[]>(
    cachedAdminEntry?.shippingTiers ?? [],
  );

  useEffect(() => {
    if (!cachedAdminEntry) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setOrders(cachedAdminEntry.orders);
      setCustomers(cachedAdminEntry.customers);
      setProducts(cachedAdminEntry.products);
      setRegistries(cachedAdminEntry.registries);
      setRegistryOrders(cachedAdminEntry.registryOrders);
      setRegistryOrderItemsByOrder(cachedAdminEntry.registryOrderItemsByOrder);
      setRegistryItemsByRegistry(cachedAdminEntry.registryItemsByRegistry);
      setRegistrySummaries(cachedAdminEntry.registrySummaries);
      setRegistryPaymentActivities(cachedAdminEntry.registryPaymentActivities);
      setDeals(cachedAdminEntry.deals);
      setBlogPosts(cachedAdminEntry.blogPosts);
      setNewsletterSubscribers(cachedAdminEntry.newsletterSubscribers);
      setNewsletterCampaigns(cachedAdminEntry.newsletterCampaigns);
      setCampaignContacts(cachedAdminEntry.campaignContacts);
      setProductCategories(cachedAdminEntry.productCategories);
      setShippingTiers(cachedAdminEntry.shippingTiers);
      setAdminAccessStatus("allowed");
      setLoading(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [cachedAdminEntry]);

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerFullName, setCustomerFullName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerState, setCustomerState] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [productName, setProductName] = useState("");
  const [productSellingPrice, setProductSellingPrice] = useState("");
  const [productCostPrice, setProductCostPrice] = useState("");
  const [productCategory, setProductCategory] = useState("Toys");
  const [productCategoriesSelection, setProductCategoriesSelection] = useState<string[]>(["Toys"]);
  const [productImage, setProductImage] = useState("");
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productDescription, setProductDescription] = useState("");
  const [productInStock, setProductInStock] = useState(true);
  const [productIsFeatured, setProductIsFeatured] = useState(false);
  const [productFeaturedSortOrder, setProductFeaturedSortOrder] = useState("0");

  const [showDealModal, setShowDealModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<HomeDealRecord | null>(null);
  const [dealProductId, setDealProductId] = useState("");
  const [dealTitle, setDealTitle] = useState("");
  const [dealSubtitle, setDealSubtitle] = useState("");
  const [dealBadgeText, setDealBadgeText] = useState("");
  const [dealImage, setDealImage] = useState("");
  const [dealSalePrice, setDealSalePrice] = useState("");
  const [dealCompareAtPrice, setDealCompareAtPrice] = useState("");
  const [dealStartsAt, setDealStartsAt] = useState("");
  const [dealEndsAt, setDealEndsAt] = useState("");
  const [dealSortOrder, setDealSortOrder] = useState("0");
  const [dealIsActive, setDealIsActive] = useState(true);
  const [dealImageFile, setDealImageFile] = useState<File | null>(null);

  const [showShippingTierModal, setShowShippingTierModal] = useState(false);
  const [editingShippingTier, setEditingShippingTier] = useState<ShippingTier | null>(null);
  const [shippingTierCode, setShippingTierCode] = useState("");
  const [shippingTierLabel, setShippingTierLabel] = useState("");
  const [shippingTierFee, setShippingTierFee] = useState("");
  const [shippingTierEta, setShippingTierEta] = useState("");
  const [shippingTierDescription, setShippingTierDescription] = useState("");
  const [shippingTierSortOrder, setShippingTierSortOrder] = useState("0");
  const [shippingTierIsActive, setShippingTierIsActive] = useState(true);
  const [savingShippingTier, setSavingShippingTier] = useState(false);

  const [showBlogModal, setShowBlogModal] = useState(false);
  const [editingBlog, setEditingBlog] = useState<BlogPostRecord | null>(null);
  const [blogTitle, setBlogTitle] = useState("");
  const [blogSlug, setBlogSlug] = useState("");
  const [blogCategory, setBlogCategory] = useState("Registry Tips");
  const [blogExcerpt, setBlogExcerpt] = useState("");
  const [blogCoverImage, setBlogCoverImage] = useState("");
  const [blogAuthorName, setBlogAuthorName] = useState("Nana's Editorial Team");
  const [blogBodyMarkdown, setBlogBodyMarkdown] = useState("");
  const [blogPublishedAt, setBlogPublishedAt] = useState("");
  const [blogIsPublished, setBlogIsPublished] = useState(true);
  const [newsletterSubject, setNewsletterSubject] = useState("");
  const [newsletterBody, setNewsletterBody] = useState("");
  const [sendingNewsletter, setSendingNewsletter] = useState(false);

  const loadAdminData = useCallback(async (showSpinner = false) => {
    if (!userId) {
      return;
    }

    if (showSpinner) {
      setLoading(true);
    }

    const [
      ordersResult,
      customersResult,
      productsResult,
      registriesResult,
      registryItemsResult,
      registryOrdersResult,
      registryContributionsResult,
      dealsResult,
      blogPostsResult,
      newsletterSubscribersResult,
      newsletterCampaignsResult,
      campaignContactsResult,
      productCategoriesResult,
      productCategoryAssignmentsResult,
      shippingTiersResult,
    ] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase
        .from("user_profiles")
        .select("*")
        .or("is_admin.eq.false,is_admin.is.null"),
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("registries").select("*").order("created_at", { ascending: false }),
      supabase
        .from("registry_items")
        .select("*, products(*)")
        .order("created_at", { ascending: false }),
      supabase
        .from("registry_orders")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("registry_contributions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("homepage_deals")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("newsletter_subscribers")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("newsletter_campaigns")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("campaign_contacts")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("product_categories")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_category_assignments")
        .select("product_id, category_id, product_categories(label, sort_order, is_active)")
        .order("created_at", { ascending: false }),
      supabase
        .from("shipping_tiers")
        .select("*")
        .order("sort_order", { ascending: true }),
    ]);

    setOrders(((ordersResult.error ? [] : ordersResult.data) ?? []) as AdminOrderRecord[]);
    setCustomers(
      ((customersResult.error ? [] : customersResult.data) ?? []) as Customer[],
    );
    const rawProducts = ((productsResult.error ? [] : productsResult.data) ?? []) as ProductRecord[];
    const productCategoryAssignments =
      productCategoryAssignmentsResult.error?.code === "42P01"
        ? []
        : (((productCategoryAssignmentsResult.error
            ? []
            : productCategoryAssignmentsResult.data) ?? []) as ProductCategoryAssignmentRecord[]);
    const assignedProductCategoriesByProductId = buildAssignedProductCategoriesByProductId(
      productCategoryAssignments,
    );
    const nextProducts = rawProducts.map((product) => ({
      ...product,
      categories: normalizeProductCategoryLabels(
        product.category,
        assignedProductCategoriesByProductId[Number(product.id)],
      ),
    }));
    setProducts(nextProducts);
    setRegistries(
      ((registriesResult.error ? [] : registriesResult.data) ?? []) as RegistryRecord[],
    );
    setDeals(((dealsResult.error ? [] : dealsResult.data) ?? []) as HomeDealRecord[]);
    setBlogPosts(
      ((blogPostsResult.error ? [] : blogPostsResult.data) ?? []) as BlogPostRecord[],
    );
    setNewsletterSubscribers(
      ((newsletterSubscribersResult.error
        ? []
        : newsletterSubscribersResult.data) ?? []) as NewsletterSubscriber[],
    );
    setNewsletterCampaigns(
      ((newsletterCampaignsResult.error
        ? []
        : newsletterCampaignsResult.data) ?? []) as NewsletterCampaign[],
    );
    setCampaignContacts(
      campaignContactsResult.error?.code === "42P01"
        ? []
        : ((campaignContactsResult.error ? [] : campaignContactsResult.data) ?? []) as CampaignContactRecord[],
    );
    setProductCategories(
      productCategoriesResult.error?.code === "42P01"
        ? []
        : ((productCategoriesResult.error ? [] : productCategoriesResult.data) ?? []) as ProductCategoryRecord[],
    );
    setShippingTiers(
      ((shippingTiersResult.error ? [] : shippingTiersResult.data) ?? []) as ShippingTier[],
    );

    const registryItems = ((registryItemsResult.error
      ? []
      : registryItemsResult.data) ?? []) as RegistryItemRecord[];
    const mappedRegistryItems = registryItems.map(mapRegistryItemRecord);
    const registryItemsById = mappedRegistryItems.reduce<Record<string, RegistryItem[]>>(
      (accumulator, item) => {
        const existing = accumulator[item.registryId] ?? [];
        existing.push(item);
        accumulator[item.registryId] = existing;
        return accumulator;
      },
      {},
    );
    setRegistryItemsByRegistry(registryItemsById);

    const registrySummaryMap = Object.fromEntries(
      Object.entries(registryItemsById).map(([registryId, items]) => [
        registryId,
        summarizeRegistryItems(items),
      ]),
    ) as Record<string, RegistrySummary>;
    setRegistrySummaries(registrySummaryMap);

    const registryOrders =
      ((registryOrdersResult.error ? [] : registryOrdersResult.data) ?? []) as RegistryOrderRecord[];
    setRegistryOrders(registryOrders);
    const registryContributions =
      ((registryContributionsResult.error
        ? []
        : registryContributionsResult.data) ?? []) as RegistryContributionRecord[];
    let registryOrderItems: RegistryOrderItemRecord[] = [];

    if (registryOrders.length > 0) {
      const { data: registryOrderItemsData, error: registryOrderItemsError } = await supabase
        .from("registry_order_items")
        .select("*")
        .in(
          "registry_order_id",
          registryOrders.map((registryOrder) => registryOrder.id),
        );

      registryOrderItems = ((registryOrderItemsError ? [] : registryOrderItemsData) ?? []) as
        RegistryOrderItemRecord[];
    }

    const registryOrderItemsMap = registryOrderItems.reduce<
      Record<string, RegistryOrderItemRecord[]>
    >((accumulator, item) => {
      const existing = accumulator[item.registry_order_id] ?? [];
      existing.push(item);
      accumulator[item.registry_order_id] = existing;
      return accumulator;
    }, {});
    setRegistryOrderItemsByOrder(registryOrderItemsMap);

    const registryPaymentsMap = (((registriesResult.error ? [] : registriesResult.data) ?? []) as
      RegistryRecord[]).reduce<Record<string, RegistryPaymentActivity[]>>(
      (accumulator, registry) => {
        const registryOrdersForRegistry = registryOrders.filter(
          (registryOrder) => registryOrder.registry_id === registry.id,
        );
        accumulator[registry.id] = buildRegistryPaymentActivities({
          contributions: registryContributions.filter(
            (contribution) => contribution.registry_id === registry.id,
          ),
          orderItems: registryOrderItems.filter((orderItem) =>
            registryOrdersForRegistry.some(
              (registryOrder) => registryOrder.id === orderItem.registry_order_id,
            ),
          ),
          orders: registryOrdersForRegistry,
          registryItems: registryItemsById[registry.id] ?? [],
        });
        return accumulator;
      },
      {},
    );
    setRegistryPaymentActivities(registryPaymentsMap);

    persistAdminDashboardCacheEntry(userId, {
      blogPosts: ((blogPostsResult.error ? [] : blogPostsResult.data) ?? []) as BlogPostRecord[],
      campaignContacts:
        campaignContactsResult.error?.code === "42P01"
          ? []
          : (((campaignContactsResult.error ? [] : campaignContactsResult.data) ?? []) as CampaignContactRecord[]),
      customers: ((customersResult.error ? [] : customersResult.data) ?? []) as Customer[],
      deals: ((dealsResult.error ? [] : dealsResult.data) ?? []) as HomeDealRecord[],
      newsletterCampaigns:
        ((newsletterCampaignsResult.error ? [] : newsletterCampaignsResult.data) ?? []) as NewsletterCampaign[],
      newsletterSubscribers:
        ((newsletterSubscribersResult.error ? [] : newsletterSubscribersResult.data) ?? []) as NewsletterSubscriber[],
      orders: ((ordersResult.error ? [] : ordersResult.data) ?? []) as AdminOrderRecord[],
      productCategories:
        productCategoriesResult.error?.code === "42P01"
          ? []
          : (((productCategoriesResult.error ? [] : productCategoriesResult.data) ?? []) as ProductCategoryRecord[]),
      products: nextProducts,
      registries: ((registriesResult.error ? [] : registriesResult.data) ?? []) as RegistryRecord[],
      registryItemsByRegistry: registryItemsById,
      registryOrderItemsByOrder: registryOrderItemsMap,
      registryOrders,
      registryPaymentActivities: registryPaymentsMap,
      registrySummaries: registrySummaryMap,
      shippingTiers:
        ((shippingTiersResult.error ? [] : shippingTiersResult.data) ?? []) as ShippingTier[],
    });

    if (showSpinner) {
      setLoading(false);
    }
  }, [userId]);

  const productLookup = useMemo(() => {
    return Object.fromEntries(products.map((product) => [product.id, product])) as Record<
      number,
      ProductRecord
    >;
  }, [products]);
  const productCategoryOptions = useMemo(() => {
    return buildProductCategoryOptions({
      includeInactive: true,
      includeProductCategories: products.flatMap((product) =>
        normalizeProductCategoryLabels(product.category, product.categories),
      ),
      records: productCategories,
    });
  }, [productCategories, products]);

  const stats = useMemo(() => {
    const paidOrders = orders.filter((order) => order.status === "paid");

    return {
      totalOrders: orders.length,
      totalRevenue: paidOrders.reduce((sum, order) => sum + Number(order.total), 0),
      totalCustomers: customers.length,
      totalProducts: products.length,
    };
  }, [customers.length, orders, products.length]);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyOrders = orders.filter((order) => {
    const orderDate = new Date(order.created_at);
    return (
      orderDate.getMonth() === currentMonth &&
      orderDate.getFullYear() === currentYear
    );
  });
  const monthlyRevenue = monthlyOrders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + Number(order.total), 0);
  const unfinishedOrders = useMemo(
    () => orders.filter((order) => order.status !== "paid"),
    [orders],
  );
  const paidOrders = useMemo(
    () => orders.filter((order) => order.status === "paid"),
    [orders],
  );
  const activeSubscribers = useMemo(
    () => newsletterSubscribers.filter((subscriber) => subscriber.is_active),
    [newsletterSubscribers],
  );
  const newsletterHistory = useMemo(
    () =>
      newsletterCampaigns.filter(
        (campaign) => (campaign.campaign_type ?? "newsletter") !== "customer",
      ),
    [newsletterCampaigns],
  );
  const getAdminAccessToken = useCallback(async () => {
    if (session?.access_token) {
      return session.access_token;
    }

    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    return currentSession?.access_token ?? null;
  }, [session]);

  const verifyAdminAccess = useCallback(async () => {
    if (!userId || !hasSupabaseEnv) {
      setAdminAccessStatus("denied");
      return false;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      setAdminAccessStatus("denied");
      return false;
    }

    const response = await fetch("/api/admin/status", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
    }).catch(() => null);

    if (!response?.ok) {
      setAdminAccessStatus("denied");
      return false;
    }

    setAdminAccessStatus("allowed");
    return true;
  }, [getAdminAccessToken, userId]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!userId || !hasSupabaseEnv) {
      queueMicrotask(() => {
        setAdminAccessStatus("denied");
        setLoading(false);
      });
      return;
    }

    const loadKey = `${userId}:admin`;
    if (initialAdminLoadKeyRef.current === loadKey) {
      return;
    }

    initialAdminLoadKeyRef.current = loadKey;

    queueMicrotask(() => {
      setAdminAccessStatus("checking");
      setLoading(!cachedAdminEntry);
      void (async () => {
        const hasAccess = await verifyAdminAccess();
        if (!hasAccess) {
          setLoading(false);
          return;
        }

        if (cachedAdminEntry) {
          setAdminAccessStatus("allowed");
          setLoading(false);
          return;
        }

        await loadAdminData(!cachedAdminEntry);
      })();
    });
  }, [authLoading, cachedAdminEntry, loadAdminData, userId, verifyAdminAccess]);

  const revalidatePublicTags = async (tags: string[]) => {
    const accessToken = await getAdminAccessToken();
    if (!accessToken || tags.length === 0) {
      return;
    }

    await fetch("/api/admin/revalidate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ tags }),
    }).catch(() => null);
  };

  const resetCustomerForm = () => {
    setEditingCustomer(null);
    setCustomerFullName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerCity("");
    setCustomerState("");
  };

  const handleEditCustomer = (customer: Customer) => {
    const shippingAddress = normalizeShippingAddress(customer.shipping_address);
    setEditingCustomer(customer);
    setCustomerFullName(customer.full_name ?? "");
    setCustomerEmail(customer.email ?? "");
    setCustomerPhone(customer.phone ?? "");
    setCustomerAddress(shippingAddress.address);
    setCustomerCity(shippingAddress.city);
    setCustomerState(shippingAddress.state);
    setShowCustomerModal(true);
  };

  const handleSaveCustomer = async (event: React.FormEvent) => {
    event.preventDefault();

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage customers.");
      return;
    }

    setSavingCustomer(true);

    try {
      const response = await fetch(
        editingCustomer
          ? `/api/admin/customers/${editingCustomer.id}`
          : "/api/admin/customers",
        {
          method: editingCustomer ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            fullName: customerFullName,
            email: customerEmail,
            phone: customerPhone,
            shippingAddress: {
              name: customerFullName,
              phone: customerPhone,
              address: customerAddress,
              city: customerCity,
              state: customerState,
            },
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not save the customer.");
        return;
      }

      toast.success(result?.message ?? (editingCustomer ? "Customer updated." : "Customer created."));
      setShowCustomerModal(false);
      resetCustomerForm();
      void loadAdminData();
    } catch (error) {
      console.error("Failed to save customer.", error);
      toast.error("Could not save the customer.");
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!window.confirm("Disable this customer account? Their order history will remain available.")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage customers.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/customers/${customerId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not disable the customer.");
        return;
      }

      toast.success(result?.message ?? "Customer disabled.");
      void loadAdminData();
    } catch (error) {
      console.error("Failed to disable customer.", error);
      toast.error("Could not disable the customer.");
    }
  };

  const resetShippingTierForm = () => {
    setEditingShippingTier(null);
    setShippingTierCode("");
    setShippingTierLabel("");
    setShippingTierFee("");
    setShippingTierEta("");
    setShippingTierDescription("");
    setShippingTierSortOrder("0");
    setShippingTierIsActive(true);
  };

  const handleEditShippingTier = (tier: ShippingTier) => {
    setEditingShippingTier(tier);
    setShippingTierCode(tier.code);
    setShippingTierLabel(tier.label);
    setShippingTierFee(String(Number(tier.fee ?? 0)));
    setShippingTierEta(tier.eta ?? "");
    setShippingTierDescription(tier.description ?? "");
    setShippingTierSortOrder(String(tier.sort_order ?? 0));
    setShippingTierIsActive(Boolean(tier.is_active));
    setShowShippingTierModal(true);
  };

  const handleSaveShippingTier = async (event: React.FormEvent) => {
    event.preventDefault();

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage shipping tiers.");
      return;
    }

    setSavingShippingTier(true);

    try {
      const response = await fetch(
        editingShippingTier
          ? `/api/admin/shipping-tiers/${editingShippingTier.id}`
          : "/api/admin/shipping-tiers",
        {
          method: editingShippingTier ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            code: shippingTierCode,
            label: shippingTierLabel,
            fee: Number(shippingTierFee || 0),
            eta: shippingTierEta,
            description: shippingTierDescription,
            sortOrder: Number(shippingTierSortOrder || 0),
            isActive: shippingTierIsActive,
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not save the shipping tier.");
        return;
      }

      toast.success(result?.message ?? (editingShippingTier ? "Shipping tier updated." : "Shipping tier created."));
      setShowShippingTierModal(false);
      resetShippingTierForm();
      void loadAdminData();
    } catch (error) {
      console.error("Failed to save shipping tier.", error);
      toast.error("Could not save the shipping tier.");
    } finally {
      setSavingShippingTier(false);
    }
  };

  const handleDeleteShippingTier = async (tierId: string) => {
    if (!window.confirm("Delete this shipping tier?")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage shipping tiers.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/shipping-tiers/${tierId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not delete the shipping tier.");
        return;
      }

      toast.success(result?.message ?? "Shipping tier deleted.");
      void loadAdminData();
    } catch (error) {
      console.error("Failed to delete shipping tier.", error);
      toast.error("Could not delete the shipping tier.");
    }
  };

  const resetProductForm = () => {
    const defaultCategory = productCategoryOptions[0] ?? "Toys";
    setEditingProduct(null);
    setProductName("");
    setProductSellingPrice("");
    setProductCostPrice("");
    setProductCategory(defaultCategory);
    setProductCategoriesSelection([defaultCategory]);
    setProductImage("");
    setProductImageFile(null);
    setProductDescription("");
    setProductInStock(true);
    setProductIsFeatured(false);
    setProductFeaturedSortOrder("0");
  };

  const handleEditProduct = (product: ProductRecord) => {
    setEditingProduct(product);
    setProductName(product.name);
    setProductSellingPrice(
      String(toNairaAmount(getProductSellingPrice(product))),
    );
    setProductCostPrice(String(toNairaAmount(getProductCostPrice(product))));
    const nextCategories = normalizeProductCategoryLabels(product.category, product.categories);
    setProductCategory(nextCategories[0] ?? product.category);
    setProductCategoriesSelection(nextCategories.length > 0 ? nextCategories : [product.category]);
    setProductImage(product.image);
    setProductImageFile(null);
    setProductDescription(product.description);
    setProductInStock(Boolean(product.in_stock));
    setProductIsFeatured(Boolean(product.is_featured));
    setProductFeaturedSortOrder(String(product.featured_sort_order ?? 0));
    setShowProductModal(true);
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();

    const sellingPrice = Number(productSellingPrice) / 1000;
    const costPrice = Number(productCostPrice) / 1000;
    const normalizedCategories = normalizeProductCategoryLabels(
      productCategoriesSelection[0] ?? productCategory,
      productCategoriesSelection,
    );
    const normalizedCategory = normalizedCategories[0] ?? "";

    if (!Number.isFinite(sellingPrice) || !Number.isFinite(costPrice)) {
      toast.error("Enter valid product prices.");
      return;
    }

    if (normalizedCategories.length === 0) {
      toast.error("Choose at least one product category first.");
      return;
    }

    const categoryIdByLabel = new Map(
      productCategories.map((category) => [category.label.trim(), category.id] as const),
    );
    const selectedCategoryIds = normalizedCategories
      .map((category) => categoryIdByLabel.get(category) ?? null)
      .filter((categoryId): categoryId is string => Boolean(categoryId));

    if (selectedCategoryIds.length !== normalizedCategories.length) {
      toast.error("One or more selected categories are missing. Refresh the categories and try again.");
      return;
    }

    const nextStoredProductImage =
      typeof productImage === "string" && productImage.trim().length > 0
        ? productImage.trim()
        : null;
    let nextProductImage = nextStoredProductImage;

    if (!productImageFile && !nextProductImage) {
      toast.error("Upload a product image file that is 500KB or smaller.");
      return;
    }

    if (productImageFile) {
      const accessToken = await getAdminAccessToken();
      if (!accessToken) {
        toast.error("Sign in again to upload product images.");
        return;
      }

      const uploadFormData = new FormData();
      uploadFormData.append("image", productImageFile);

      const uploadResponse = await fetch("/api/admin/products/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: uploadFormData,
      });

      const uploadResult = (await uploadResponse.json().catch(() => null)) as
        | { dataUrl?: string; message?: string }
        | null;

      if (!uploadResponse.ok || !uploadResult?.dataUrl) {
        toast.error(uploadResult?.message ?? "Could not upload the product image.");
        return;
      }

      nextProductImage = uploadResult.dataUrl;
    }

    const baseProductSlug = createProductSlug(productName) || "product";
    const nextProductSlug = products.some((product) => {
      return (
        product.id !== editingProduct?.id &&
        (product.slug?.trim() || createProductSlug(product.name)) === baseProductSlug
      );
    })
      ? `${baseProductSlug}-${editingProduct?.id ?? Date.now()}`
      : baseProductSlug;

    const productPayload = {
      name: productName,
      slug: nextProductSlug,
      price: sellingPrice,
      selling_price: sellingPrice,
      cost_price: costPrice,
      category: normalizedCategory,
      image: nextProductImage,
      description: productDescription,
      in_stock: productInStock,
      is_featured: productIsFeatured,
      featured_sort_order: Number(productFeaturedSortOrder || 0),
    };

    const { data: savedProduct, error } = editingProduct
      ? await supabase
          .from("products")
          .update(productPayload)
          .eq("id", editingProduct.id)
          .select("*")
          .single()
      : await supabase.from("products").insert(productPayload).select("*").single();

    if (error || !savedProduct) {
      toast.error("Failed to save product.");
      return;
    }

    const { error: deleteAssignmentsError } = await supabase
      .from("product_category_assignments")
      .delete()
      .eq("product_id", Number(savedProduct.id));

    if (deleteAssignmentsError?.code === "42P01") {
      toast.error("Run the multi-category migration before assigning products to multiple categories.");
      return;
    }

    if (deleteAssignmentsError) {
      toast.error("Product saved, but its categories could not be updated.");
      return;
    }

    if (selectedCategoryIds.length > 0) {
      const { error: assignmentInsertError } = await supabase
        .from("product_category_assignments")
        .insert(
          selectedCategoryIds.map((categoryId) => ({
            product_id: Number(savedProduct.id),
            category_id: categoryId,
          })),
        );

      if (assignmentInsertError?.code === "42P01") {
        toast.error("Run the multi-category migration before assigning products to multiple categories.");
        return;
      }

      if (assignmentInsertError) {
        toast.error("Product saved, but its categories could not be updated.");
        return;
      }
    }

    if (!editingProduct && nextProductSlug !== baseProductSlug) {
      const canonicalSlug = `${baseProductSlug}-${savedProduct.id}`;
      const { error: slugUpdateError } = await supabase
        .from("products")
        .update({ slug: canonicalSlug })
        .eq("id", savedProduct.id);

      if (slugUpdateError) {
        toast.error("Product saved, but its slug could not be finalized.");
      }
    }

    toast.success(editingProduct ? "Product updated." : "Product created.");
    setShowProductModal(false);
    resetProductForm();
    await revalidatePublicTags(["products"]);
    void loadAdminData();
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!window.confirm("Delete this product?")) {
      return;
    }

    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) {
      toast.error("Failed to delete product.");
      return;
    }

    toast.success("Product deleted.");
    await revalidatePublicTags(["products"]);
    void loadAdminData();
  };

  const resetDealForm = () => {
    setEditingDeal(null);
    setDealProductId(products[0] ? String(products[0].id) : "");
    setDealTitle("");
    setDealSubtitle("");
    setDealBadgeText("");
    setDealImage("");
    setDealImageFile(null);
    setDealSalePrice("");
    setDealCompareAtPrice("");
    setDealStartsAt("");
    setDealEndsAt("");
    setDealSortOrder("0");
    setDealIsActive(true);
  };

  const handleEditDeal = (deal: HomeDealRecord) => {
    setEditingDeal(deal);
    setDealProductId(String(deal.product_id));
    setDealTitle(deal.title);
    setDealSubtitle(deal.subtitle ?? "");
    setDealBadgeText(deal.badge_text ?? "");
    setDealImage(deal.override_image ?? "");
    setDealImageFile(null);
    setDealSalePrice(String(toNairaAmount(Number(deal.sale_price))));
    setDealCompareAtPrice(
      deal.compare_at_price ? String(toNairaAmount(Number(deal.compare_at_price))) : "",
    );
    setDealStartsAt(toDatetimeLocalValue(deal.starts_at));
    setDealEndsAt(toDatetimeLocalValue(deal.ends_at));
    setDealSortOrder(String(deal.sort_order ?? 0));
    setDealIsActive(Boolean(deal.is_active));
    setShowDealModal(true);
  };

  const handleSaveDeal = async (event: React.FormEvent) => {
    event.preventDefault();

    const hasExistingUploadedImage =
      typeof dealImage === "string" && dealImage.startsWith("data:image/");
    let overrideImage = hasExistingUploadedImage ? dealImage : null;

    if (!dealImageFile && !overrideImage) {
      toast.error("Upload a deal image file that is 500KB or smaller.");
      return;
    }

    if (dealImageFile) {
      const accessToken = await getAdminAccessToken();
      if (!accessToken) {
        toast.error("Sign in again to upload deal images.");
        return;
      }

      const uploadFormData = new FormData();
      uploadFormData.append("image", dealImageFile);

      const uploadResponse = await fetch("/api/admin/deals/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: uploadFormData,
      });

      const uploadResult = (await uploadResponse.json().catch(() => null)) as
        | { dataUrl?: string; message?: string }
        | null;

      if (!uploadResponse.ok || !uploadResult?.dataUrl) {
        toast.error(uploadResult?.message ?? "Could not upload the deal image.");
        return;
      }

      overrideImage = uploadResult.dataUrl;
    }

    const payload = {
      product_id: Number(dealProductId),
      title: dealTitle,
      subtitle: dealSubtitle || null,
      badge_text: dealBadgeText || null,
      override_image: overrideImage,
      sale_price: Number(dealSalePrice) / 1000,
      compare_at_price: dealCompareAtPrice ? Number(dealCompareAtPrice) / 1000 : null,
      starts_at: dealStartsAt ? new Date(dealStartsAt).toISOString() : null,
      ends_at: dealEndsAt ? new Date(dealEndsAt).toISOString() : null,
      is_active: dealIsActive,
      sort_order: Number(dealSortOrder || 0),
    };

    const { error } = editingDeal
      ? await supabase.from("homepage_deals").update(payload).eq("id", editingDeal.id)
      : await supabase.from("homepage_deals").insert(payload);

    if (error) {
      toast.error("Failed to save deal.");
      return;
    }

    toast.success(editingDeal ? "Deal updated." : "Deal created.");
    setShowDealModal(false);
    resetDealForm();
    await revalidatePublicTags(["products"]);
    void loadAdminData();
  };

  const handleDeleteDeal = async (dealId: string) => {
    if (!window.confirm("Delete this deal?")) {
      return;
    }

    const { error } = await supabase.from("homepage_deals").delete().eq("id", dealId);
    if (error) {
      toast.error("Failed to delete deal.");
      return;
    }

    toast.success("Deal deleted.");
    await revalidatePublicTags(["products"]);
    void loadAdminData();
  };

  const resetBlogForm = () => {
    setEditingBlog(null);
    setBlogTitle("");
    setBlogSlug("");
    setBlogCategory("Registry Tips");
    setBlogExcerpt("");
    setBlogCoverImage("");
    setBlogAuthorName("Nana's Editorial Team");
    setBlogBodyMarkdown("");
    setBlogPublishedAt("");
    setBlogIsPublished(true);
  };

  const handleEditBlog = (blog: BlogPostRecord) => {
    setEditingBlog(blog);
    setBlogTitle(blog.title);
    setBlogSlug(blog.slug);
    setBlogCategory(blog.category);
    setBlogExcerpt(blog.excerpt);
    setBlogCoverImage(blog.cover_image ?? "");
    setBlogAuthorName(blog.author_name);
    setBlogBodyMarkdown(blog.body_markdown);
    setBlogPublishedAt(toDatetimeLocalValue(blog.published_at));
    setBlogIsPublished(Boolean(blog.is_published));
    setShowBlogModal(true);
  };

  const handleSaveBlog = async (event: React.FormEvent) => {
    event.preventDefault();

    const publishedAt =
      blogIsPublished && blogPublishedAt
        ? new Date(blogPublishedAt).toISOString()
        : blogIsPublished
          ? new Date().toISOString()
          : null;

    const payload = {
      title: blogTitle,
      slug: blogSlug || createSlug(blogTitle),
      category: blogCategory,
      excerpt: blogExcerpt,
      cover_image: blogCoverImage || null,
      body_markdown: blogBodyMarkdown,
      author_name: blogAuthorName,
      is_published: blogIsPublished,
      published_at: publishedAt,
    };

    const { error } = editingBlog
      ? await supabase.from("blog_posts").update(payload).eq("id", editingBlog.id)
      : await supabase.from("blog_posts").insert(payload);

    if (error) {
      toast.error("Failed to save blog post.");
      return;
    }

    toast.success(editingBlog ? "Blog post updated." : "Blog post created.");
    setShowBlogModal(false);
    resetBlogForm();
    await revalidatePublicTags(["blog"]);
    void loadAdminData();
  };

  const handleDeleteBlog = async (blogId: string) => {
    if (!window.confirm("Delete this blog post?")) {
      return;
    }

    const { error } = await supabase.from("blog_posts").delete().eq("id", blogId);
    if (error) {
      toast.error("Failed to delete blog post.");
      return;
    }

    toast.success("Blog post deleted.");
    await revalidatePublicTags(["blog"]);
    void loadAdminData();
  };

  const handleSendNewsletter = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!newsletterSubject.trim() || !newsletterBody.trim()) {
      toast.error("Add a subject and message before sending.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      toast.error("Sign in again to send newsletters.");
      return;
    }

    setSendingNewsletter(true);

    try {
      const response = await fetch("/api/newsletter/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subject: newsletterSubject,
          body: newsletterBody,
        }),
      });

      const result = (await response.json()) as {
        message?: string;
        recipientCount?: number;
        sandbox?: boolean;
      };

      if (!response.ok) {
        toast.error(result.message ?? "Failed to send newsletter.");
        return;
      }

      toast.success(
        result.sandbox
          ? `Brevo sandbox accepted the newsletter for ${result.recipientCount ?? activeSubscribers.length} subscribers.`
          : `Newsletter sent to ${result.recipientCount ?? activeSubscribers.length} subscribers.`,
      );
      setNewsletterSubject("");
      setNewsletterBody("");
      void loadAdminData();
    } catch (error) {
      console.error("Failed to send newsletter.", error);
      toast.error("Failed to send newsletter.");
    } finally {
      setSendingNewsletter(false);
    }
  };

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Loading admin dashboard...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Please sign in to continue.</p>
      </div>
    );
  }

  if (adminAccessStatus === "checking") {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Checking admin access...</p>
      </div>
    );
  }

  if (adminAccessStatus !== "allowed") {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Access denied. Admin only.</p>
      </div>
    );
  }

  if (!hasSupabaseEnv) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">
          Connect Supabase to enable the admin dashboard.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paidOrders.length}</div>
            <p className="text-xs text-gray-500">{monthlyOrders.length} this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNairaAmount(stats.totalRevenue)}
            </div>
            <p className="text-xs text-gray-500">
              {formatNairaAmount(monthlyRevenue)} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
            <p className="text-xs text-gray-500">Registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Products</CardTitle>
            <ShoppingBag className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-gray-500">
              {products.filter((product) => product.in_stock).length} in stock
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="orders" className="space-y-6">
        <TabsList className="flex h-auto flex-wrap justify-start gap-2">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="registries">Accounts</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="newsletter">Newsletter</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
          <TabsTrigger value="shipping">Shipping Tiers</TabsTrigger>
          <TabsTrigger value="blogs">Blogs</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                    Paid Orders
                  </p>
                  <p className="mt-2 text-3xl font-bold text-green-600">
                    {paidOrders.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                    Unfinished Orders
                  </p>
                  <p className="mt-2 text-3xl font-bold text-amber-600">
                    {unfinishedOrders.length}
                  </p>
                </CardContent>
              </Card>
            </div>

            <AdminOrdersManager
              customers={customers}
              getAdminAccessToken={getAdminAccessToken}
              onReload={loadAdminData}
              orders={orders}
              products={products}
              shippingTiers={shippingTiers}
            />
          </div>
        </TabsContent>

        <TabsContent value="registries">
          <div className="space-y-6">
            <AdminRegistryAccountsManager
              customers={customers}
              registries={registries}
              registryItemsByRegistry={registryItemsByRegistry}
              registryPaymentActivities={registryPaymentActivities}
              registrySummaries={registrySummaries}
            />

            <AdminRegistryOrdersManager
              customers={customers}
              getAdminAccessToken={getAdminAccessToken}
              onReload={loadAdminData}
              orderItemsByOrderId={registryOrderItemsByOrder}
              orders={registryOrders}
              registries={registries}
              registryItemsByRegistry={registryItemsByRegistry}
            />
          </div>
        </TabsContent>

        <TabsContent value="customers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Customers</CardTitle>
              <Button
                onClick={() => {
                  resetCustomerForm();
                  setShowCustomerModal(true);
                }}
              >
                <Users className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>{customer.full_name ?? "N/A"}</TableCell>
                      <TableCell>{customer.email ?? "N/A"}</TableCell>
                      <TableCell>{customer.phone ?? "N/A"}</TableCell>
                      <TableCell>
                        {customer.shipping_address?.address
                          ? `${customer.shipping_address.address}, ${customer.shipping_address.city ?? ""} ${customer.shipping_address.state ?? ""}`.trim()
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {customer.account_status === "disabled" || customer.deleted_at
                          ? "Disabled"
                          : "Active"}
                      </TableCell>
                      <TableCell>{formatDate(customer.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCustomer(customer)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteCustomer(customer.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="newsletter">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Send Newsletter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm text-gray-500">Active Subscribers</div>
                    <div className="mt-2 text-3xl font-bold">
                      {activeSubscribers.length}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm text-gray-500">Campaigns Sent</div>
                    <div className="mt-2 text-3xl font-bold">
                      {newsletterHistory.filter((campaign) => campaign.status === "sent").length}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSendNewsletter} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newsletter-subject">Subject</Label>
                    <Input
                      id="newsletter-subject"
                      value={newsletterSubject}
                      onChange={(event) => setNewsletterSubject(event.target.value)}
                      placeholder="New arrivals for your little one"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newsletter-body">Message</Label>
                    <Textarea
                      id="newsletter-body"
                      value={newsletterBody}
                      onChange={(event) => setNewsletterBody(event.target.value)}
                      placeholder={"Write the newsletter here.\n\nYou can use line breaks and short paragraphs."}
                      className="min-h-56"
                      required
                    />
                  </div>
                  <Button type="submit" disabled={sendingNewsletter || activeSubscribers.length === 0}>
                    <Mail className="mr-2 h-4 w-4" />
                    {sendingNewsletter ? "Sending..." : "Send Newsletter"}
                  </Button>
                  {activeSubscribers.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No subscribers yet. Once someone subscribes from the blog page, they will show here.
                    </p>
                  ) : null}
                </form>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Subscribers</CardTitle>
                </CardHeader>
                <CardContent>
                  {newsletterSubscribers.length === 0 ? (
                    <p className="text-sm text-gray-500">No subscribers yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Subscribed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {newsletterSubscribers.slice(0, 8).map((subscriber) => (
                          <TableRow key={subscriber.id}>
                            <TableCell>{subscriber.email}</TableCell>
                            <TableCell>{subscriber.source ?? "Website"}</TableCell>
                            <TableCell>{formatDate(subscriber.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Campaign History</CardTitle>
                </CardHeader>
                <CardContent>
                  {newsletterHistory.length === 0 ? (
                    <p className="text-sm text-gray-500">No newsletter campaigns sent yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Recipients</TableHead>
                          <TableHead>Sent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {newsletterHistory.slice(0, 6).map((campaign) => (
                          <TableRow key={campaign.id}>
                            <TableCell>{campaign.subject}</TableCell>
                            <TableCell>{campaign.status}</TableCell>
                            <TableCell>{campaign.recipient_count}</TableCell>
                            <TableCell>{formatDateTime(campaign.sent_at ?? campaign.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="campaigns">
          <AdminCampaignManager
            campaigns={newsletterCampaigns}
            contacts={campaignContacts}
            customers={customers}
            getAdminAccessToken={getAdminAccessToken}
            onReload={loadAdminData}
          />
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Products</CardTitle>
                <p className="mt-1 text-sm text-gray-500">
                  Choose from your admin-managed categories when adding or editing products.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const categoriesTabButton = document.querySelector(
                      '[data-state][value="categories"]',
                    ) as HTMLButtonElement | null;
                    categoriesTabButton?.click();
                  }}
                >
                  Manage Categories
                </Button>
                <Button
                  onClick={() => {
                    resetProductForm();
                    setShowProductModal(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>Featured</TableHead>
                    <TableHead>Selling</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-gray-500">
                          /products/{product.slug?.trim() || createProductSlug(product.name)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {normalizeProductCategoryLabels(product.category, product.categories).join(", ")}
                      </TableCell>
                      <TableCell>
                        {product.is_featured
                          ? `Yes${Number(product.featured_sort_order ?? 0) > 0
                            ? ` (${product.featured_sort_order})`
                            : ""}`
                          : "No"}
                      </TableCell>
                      <TableCell>
                        {formatNaira(getProductSellingPrice(product))}
                      </TableCell>
                      <TableCell>{formatNaira(getProductCostPrice(product))}</TableCell>
                      <TableCell>
                        <span className={product.in_stock ? "text-green-600" : "text-red-600"}>
                          {product.in_stock ? "In Stock" : "Out of Stock"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditProduct(product)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteProduct(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <AdminProductCategoriesManager
            categories={productCategories}
            onReload={loadAdminData}
            onRevalidateProducts={async () => {
              await revalidatePublicTags(["products"]);
            }}
            products={products}
          />
        </TabsContent>

        <TabsContent value="deals">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Homepage Deals</CardTitle>
                <p className="mt-1 text-sm text-gray-500">
                  Lower sort-order values appear earlier on the storefront. Deals can be edited or deleted here.
                </p>
              </div>
              <Button
                onClick={() => {
                  resetDealForm();
                  setShowDealModal(true);
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Add Deal
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Pricing</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell>
                        <div className="font-medium">{deal.title}</div>
                        <div className="text-xs text-gray-500">
                          {deal.badge_text || "No badge"}
                        </div>
                      </TableCell>
                      <TableCell>{productLookup[deal.product_id]?.name ?? "N/A"}</TableCell>
                      <TableCell>
                        {formatNaira(Number(deal.sale_price))}
                        {deal.compare_at_price ? (
                          <span className="ml-2 text-xs text-gray-500 line-through">
                            {formatNaira(Number(deal.compare_at_price))}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {formatDate(deal.starts_at)} to {formatDate(deal.ends_at)}
                      </TableCell>
                      <TableCell>{Number(deal.sort_order ?? 0)}</TableCell>
                      <TableCell>{getDealStatusLabel(deal)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditDeal(deal)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteDeal(deal.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shipping">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Shipping Tiers</CardTitle>
                <p className="mt-1 text-sm text-gray-500">
                  Sort order controls which tier appears first at checkout. Shipping tiers can be edited or deleted here anytime.
                </p>
              </div>
              <Button
                onClick={() => {
                  resetShippingTierForm();
                  setShowShippingTierModal(true);
                }}
              >
                <MapPin className="mr-2 h-4 w-4" />
                Add Shipping Tier
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shippingTiers.map((tier) => (
                    <TableRow key={tier.id}>
                      <TableCell>
                        <div className="font-medium">{tier.label}</div>
                        <div className="text-xs text-gray-500">
                          {tier.description || "No description"}
                        </div>
                      </TableCell>
                      <TableCell>{tier.code}</TableCell>
                      <TableCell>{formatNairaAmount(Number(tier.fee ?? 0))}</TableCell>
                      <TableCell>{tier.eta || "N/A"}</TableCell>
                      <TableCell>{Number(tier.sort_order ?? 0)}</TableCell>
                      <TableCell>{tier.is_active ? "Active" : "Inactive"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditShippingTier(tier)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteShippingTier(tier.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blogs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Blog Posts</CardTitle>
              <Button
                onClick={() => {
                  resetBlogForm();
                  setShowBlogModal(true);
                }}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Write Blog Post
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blogPosts.map((post) => (
                    <TableRow key={post.id}>
                      <TableCell>
                        <div className="font-medium">{post.title}</div>
                        <div className="text-xs text-gray-500">{post.slug}</div>
                      </TableCell>
                      <TableCell>{post.category}</TableCell>
                      <TableCell>{post.author_name}</TableCell>
                      <TableCell>{post.is_published ? "Published" : "Draft"}</TableCell>
                      <TableCell>{formatDate(post.published_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditBlog(post)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {post.is_published ? (
                            <Button asChild variant="outline" size="sm">
                              <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          ) : null}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteBlog(post.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCustomerModal} onOpenChange={setShowCustomerModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveCustomer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-full-name">Full Name</Label>
              <Input
                id="customer-full-name"
                value={customerFullName}
                onChange={(event) => setCustomerFullName(event.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer-email">Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-phone">Phone</Label>
                <Input
                  id="customer-phone"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-address">Shipping Address</Label>
              <Input
                id="customer-address"
                value={customerAddress}
                onChange={(event) => setCustomerAddress(event.target.value)}
                placeholder="Street address"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer-city">City</Label>
                <Input
                  id="customer-city"
                  value={customerCity}
                  onChange={(event) => setCustomerCity(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-state">State</Label>
                <Input
                  id="customer-state"
                  value={customerState}
                  onChange={(event) => setCustomerState(event.target.value)}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={savingCustomer}>
              {savingCustomer
                ? "Saving..."
                : editingCustomer
                  ? "Update Customer"
                  : "Create Customer and Send Invite"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showShippingTierModal} onOpenChange={setShowShippingTierModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingShippingTier ? "Edit Shipping Tier" : "Add Shipping Tier"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveShippingTier} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shipping-tier-code">Code</Label>
                <Input
                  id="shipping-tier-code"
                  value={shippingTierCode}
                  onChange={(event) => setShippingTierCode(event.target.value)}
                  placeholder="lagos"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shipping-tier-label">Label</Label>
                <Input
                  id="shipping-tier-label"
                  value={shippingTierLabel}
                  onChange={(event) => setShippingTierLabel(event.target.value)}
                  placeholder="Lagos"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="shipping-tier-fee">Fee (NGN amount)</Label>
                <Input
                  id="shipping-tier-fee"
                  type="number"
                  min="0"
                  value={shippingTierFee}
                  onChange={(event) => setShippingTierFee(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shipping-tier-eta">ETA</Label>
                <Input
                  id="shipping-tier-eta"
                  value={shippingTierEta}
                  onChange={(event) => setShippingTierEta(event.target.value)}
                  placeholder="2-3 days"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shipping-tier-sort-order">Sort Order</Label>
                <Input
                  id="shipping-tier-sort-order"
                  type="number"
                  min="0"
                  value={shippingTierSortOrder}
                  onChange={(event) => setShippingTierSortOrder(event.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Lower numbers appear earlier in checkout and admin lists.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shipping-tier-description">Description</Label>
              <Textarea
                id="shipping-tier-description"
                value={shippingTierDescription}
                onChange={(event) => setShippingTierDescription(event.target.value)}
                rows={3}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={shippingTierIsActive}
                onChange={(event) => setShippingTierIsActive(event.target.checked)}
              />
              Shipping tier is active
            </label>

            <Button type="submit" className="w-full" disabled={savingShippingTier}>
              {savingShippingTier
                ? "Saving..."
                : editingShippingTier
                  ? "Update Shipping Tier"
                  : "Create Shipping Tier"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveProduct} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product-name">Product Name</Label>
              <Input
                id="product-name"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-selling-price">Selling Price (NGN)</Label>
                <Input
                  id="product-selling-price"
                  type="number"
                  min="0"
                  value={productSellingPrice}
                  onChange={(event) => setProductSellingPrice(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-cost-price">Cost Price (NGN)</Label>
                <Input
                  id="product-cost-price"
                  type="number"
                  min="0"
                  value={productCostPrice}
                  onChange={(event) => setProductCostPrice(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Categories</Label>
                <div className="flex flex-wrap gap-2">
                  {productCategoryOptions.map((category) => {
                    const isSelected = productCategoriesSelection.includes(category);

                    return (
                      <Button
                        key={category}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => {
                          const nextCategories = isSelected
                            ? productCategoriesSelection.filter((value) => value !== category)
                            : [...productCategoriesSelection, category];
                          setProductCategoriesSelection(nextCategories);
                          setProductCategory(nextCategories[0] ?? "");
                        }}
                      >
                        {category}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500">
                  Select one or more categories. The first selected category becomes the primary
                  product badge and default display category.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-image">Product Image Upload</Label>
              <Input
                id="product-image"
                type="file"
                accept="image/*"
                required={!editingProduct && !productImage}
                onChange={(event) => setProductImageFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-gray-500">
                Upload an image file up to 500KB. URLs are no longer supported.
              </p>
              {productImage ? (
                <p className="text-xs text-gray-500">
                  Existing image will stay in place unless you upload a new one.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-description">Description</Label>
              <Textarea
                id="product-description"
                value={productDescription}
                onChange={(event) => setProductDescription(event.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-featured-order">Featured Sort Order</Label>
                <Input
                  id="product-featured-order"
                  type="number"
                  min="0"
                  value={productFeaturedSortOrder}
                  onChange={(event) => setProductFeaturedSortOrder(event.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={productIsFeatured}
                onChange={(event) => setProductIsFeatured(event.target.checked)}
              />
              Show this product in featured category tabs
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={productInStock}
                onChange={(event) => setProductInStock(event.target.checked)}
              />
              In stock
            </label>

            <Button type="submit" className="w-full">
              {editingProduct ? "Update Product" : "Create Product"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDealModal} onOpenChange={setShowDealModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingDeal ? "Edit Deal" : "Add Deal"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveDeal} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deal-product">Linked Product</Label>
              <Select value={dealProductId} onValueChange={setDealProductId}>
                <SelectTrigger id="deal-product">
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={String(product.id)}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deal-title">Deal Title</Label>
                <Input
                  id="deal-title"
                  value={dealTitle}
                  onChange={(event) => setDealTitle(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-badge">Badge Text</Label>
                <Input
                  id="deal-badge"
                  value={dealBadgeText}
                  onChange={(event) => setDealBadgeText(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deal-subtitle">Subtitle</Label>
              <Textarea
                id="deal-subtitle"
                value={dealSubtitle}
                onChange={(event) => setDealSubtitle(event.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deal-sale-price">Sale Price (NGN)</Label>
                <Input
                  id="deal-sale-price"
                  type="number"
                  min="0"
                  value={dealSalePrice}
                  onChange={(event) => setDealSalePrice(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-compare-price">Compare At Price (NGN)</Label>
                <Input
                  id="deal-compare-price"
                  type="number"
                  min="0"
                  value={dealCompareAtPrice}
                  onChange={(event) => setDealCompareAtPrice(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deal-image">Deal Image Upload</Label>
              <Input
                id="deal-image"
                type="file"
                accept="image/*"
                required={!editingDeal && !dealImage}
                onChange={(event) => setDealImageFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-gray-500">
                Upload an image file up to 500KB. URLs are no longer supported.
              </p>
              {dealImage ? (
                <p className="text-xs text-gray-500">
                  Existing image will stay in place unless you upload a new one.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="deal-starts">Starts At</Label>
                <Input
                  id="deal-starts"
                  type="datetime-local"
                  value={dealStartsAt}
                  onChange={(event) => setDealStartsAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-ends">Ends At</Label>
                <Input
                  id="deal-ends"
                  type="datetime-local"
                  value={dealEndsAt}
                  onChange={(event) => setDealEndsAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-sort-order">Sort Order</Label>
                <Input
                  id="deal-sort-order"
                  type="number"
                  value={dealSortOrder}
                  onChange={(event) => setDealSortOrder(event.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Lower numbers appear first in the homepage deals carousel.
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Homepage deals only show when the deal is active and the current date falls within
              the selected start and end window.
            </p>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={dealIsActive}
                onChange={(event) => setDealIsActive(event.target.checked)}
              />
              Deal is active
            </label>

            <Button type="submit" className="w-full">
              {editingDeal ? "Update Deal" : "Create Deal"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showBlogModal} onOpenChange={setShowBlogModal}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBlog ? "Edit Blog Post" : "Write Blog Post"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveBlog} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="blog-title">Title</Label>
                <Input
                  id="blog-title"
                  value={blogTitle}
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    setBlogTitle(nextTitle);
                    if (!editingBlog) {
                      setBlogSlug(createSlug(nextTitle));
                    }
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-category">Category</Label>
                <Input
                  id="blog-category"
                  value={blogCategory}
                  onChange={(event) => setBlogCategory(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="blog-slug">Slug</Label>
                <Input
                  id="blog-slug"
                  value={blogSlug}
                  onChange={(event) => setBlogSlug(createSlug(event.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-author">Author Name</Label>
                <Input
                  id="blog-author"
                  value={blogAuthorName}
                  onChange={(event) => setBlogAuthorName(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="blog-excerpt">Excerpt</Label>
              <Textarea
                id="blog-excerpt"
                value={blogExcerpt}
                onChange={(event) => setBlogExcerpt(event.target.value)}
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="blog-cover-image">Cover Image URL</Label>
              <Input
                id="blog-cover-image"
                value={blogCoverImage}
                onChange={(event) => setBlogCoverImage(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="blog-body">Body (Markdown)</Label>
              <Textarea
                id="blog-body"
                value={blogBodyMarkdown}
                onChange={(event) => setBlogBodyMarkdown(event.target.value)}
                rows={14}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="blog-published-at">Publish Date</Label>
                <Input
                  id="blog-published-at"
                  type="datetime-local"
                  value={blogPublishedAt}
                  onChange={(event) => setBlogPublishedAt(event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 self-end text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={blogIsPublished}
                  onChange={(event) => setBlogIsPublished(event.target.checked)}
                />
                Publish immediately
              </label>
            </div>

            <Button type="submit" className="w-full">
              {editingBlog ? "Update Blog Post" : "Create Blog Post"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
