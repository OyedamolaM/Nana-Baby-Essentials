"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useDebouncedValue } from "../hooks/useDebounceValue";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ClipboardList,
  DollarSign,
  Edit,
  ExternalLink,
  FileText,
  Gift,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageSquareQuote,
  Package,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

const ADMIN_BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
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
  PRODUCT_LIST_SELECT,
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
  normalizeProductCategoryLabels,
  type ProductCategoryRecord,
} from "../../lib/productCategories";
import {
  buildHomepageSiteContent,
  DEFAULT_ABOUT_IMAGES,
  type HomepageImageAsset,
  type HomepageReviewRecord,
  type HomepageSiteContent,
  type SiteContentSettingRecord,
} from "../../lib/siteContent";
import {
  buildSpecialPackageTypeLabel,
  SPECIAL_PACKAGE_TYPES,
  type SpecialPackageRecord,
  type SpecialPackageType,
} from "../../lib/specialPackages";
import {
  splitLocationOpeningHours,
  type StoreLocationRecord,
} from "../../lib/storeLocations";
import {
  AdminCampaignManager,
  type CampaignContactRecord,
} from "../components/admin/AdminCampaignManager";
import {
  AdminAbandonedCartsManager,
  type AdminAbandonedCart,
} from "../components/admin/AdminAbandonedCartsManager";
import { AdminOrdersManager, type AdminOrderRecord } from "../components/admin/AdminOrdersManager";
import { AdminProductCategoriesManager } from "../components/admin/AdminProductCategoriesManager";
import { AdminRegistryAccountsManager } from "../components/admin/AdminRegistryAccountsManager";
import { AdminDateTimeField } from "../components/admin/AdminDateTimeField";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { Tabs, TabsContent } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../components/ui/utils";

type AdminSectionId =
  | "overview"
  | "orders"
  | "abandoned-carts"
  | "registries"
  | "customers"
  | "products"
  | "categories"
  | "deals"
  | "packages"
  | "campaigns"
  | "newsletter"
  | "reviews"
  | "blogs"
  | "content"
  | "shipping";

type AdminNavigationItem = {
  description: string;
  icon: typeof LayoutDashboard;
  id: AdminSectionId;
  label: string;
};

type AdminNavigationGroup = {
  items: AdminNavigationItem[];
  label: string;
};

const ADMIN_NAVIGATION_GROUPS: AdminNavigationGroup[] = [
  {
    label: "Overview",
    items: [
      {
        id: "overview",
        label: "Overview",
        description: "Store performance and shortcuts",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Sales & Fulfilment",
    items: [
      {
        id: "orders",
        label: "Orders",
        description: "Paid and unfinished orders",
        icon: ClipboardList,
      },
      {
        id: "abandoned-carts",
        label: "Abandoned Carts",
        description: "Follow up incomplete checkouts",
        icon: ShoppingCart,
      },
      {
        id: "registries",
        label: "Registries",
        description: "Gift activity and fulfilment",
        icon: Gift,
      },
      {
        id: "customers",
        label: "Customers",
        description: "Profiles and account access",
        icon: Users,
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      {
        id: "products",
        label: "Products",
        description: "Inventory, images and variants",
        icon: ShoppingBag,
      },
      {
        id: "categories",
        label: "Categories",
        description: "Product catalogue structure",
        icon: Tags,
      },
      {
        id: "deals",
        label: "Deals",
        description: "Homepage promotions",
        icon: Sparkles,
      },
      {
        id: "packages",
        label: "Packages",
        description: "Special product packages",
        icon: Package,
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        id: "campaigns",
        label: "Campaigns",
        description: "Customer outreach",
        icon: Megaphone,
      },
      {
        id: "newsletter",
        label: "Newsletter",
        description: "Subscribers and broadcasts",
        icon: Mail,
      },
      {
        id: "reviews",
        label: "Reviews",
        description: "Homepage and registry reviews",
        icon: MessageSquareQuote,
      },
      {
        id: "blogs",
        label: "Blog",
        description: "Editorial content",
        icon: BookOpen,
      },
    ],
  },
  {
    label: "Website & Settings",
    items: [
      {
        id: "content",
        label: "Website Editor",
        description: "Homepage and store locations",
        icon: FileText,
      },
      {
        id: "shipping",
        label: "Shipping Tiers",
        description: "Delivery options and pricing",
        icon: Truck,
      },
    ],
  },
];

function AdminNavigation({
  activeSection,
  onSelect,
}: {
  activeSection: AdminSectionId;
  onSelect: (section: AdminSectionId) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="px-3 text-lg font-bold text-pink-600">Admin Dashboard</p>
      <nav aria-label="Admin sections" className="space-y-6">
        {ADMIN_NAVIGATION_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeSection;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
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
                          "block text-xs",
                          isActive ? "text-pink-600" : "text-gray-400",
                        )}
                      >
                        {item.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

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
  fulfillment_type?: "delivery" | "pickup" | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
};

type AboutImageDraft = HomepageImageAsset & {
  file: File | null;
};

type AdminProductImage = {
  id: string;
  is_primary: boolean;
  sort_order: number;
  thumbnail_url?: string | null;
  url: string;
};

type VariantImageDraft = {
  id: string;
  url: string;
  thumbnailUrl?: string;
};

type ProductVariantDraft = {
  color: string;
  id?: string;
  images: VariantImageDraft[];
  pendingImageFiles: File[];
  pendingImagePreviews: string[];
  inStock: boolean;
  priceOverride: string;
  size: string;
  sku: string;
  stockQuantity: string;
};

type UploadedProductImage = {
  path: string;
  thumbnailPath: string;
  thumbnailUrl: string;
  url: string;
};

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

function buildAboutImageDrafts(images?: HomepageImageAsset[]) {
  return DEFAULT_ABOUT_IMAGES.map((fallbackImage, index) => ({
    ...(images?.[index] ?? fallbackImage),
    file: null,
  }));
}

export function AdminDashboard() {
  const { user, session, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [loading, setLoading] = useState(Boolean(userId));
  const [adminAccessStatus, setAdminAccessStatus] = useState<
    "checking" | "allowed" | "denied"
  >("checking");
  const initialAdminLoadKeyRef = useRef<string | null>(null);
  const ORDERS_PAGE_SIZE = 30;
  const [orders, setOrders] = useState<AdminOrderRecord[]>([]);
  const [activeAdminTab, setActiveAdminTab] = useState<AdminSectionId>("overview");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [ordersLoadingMore, setOrdersLoadingMore] = useState(false);
  const [ordersHasMore, setOrdersHasMore] = useState(true);
  const ordersPageRef = useRef(0);
  const loadedOrderQueryRef = useRef<string | null>(null);
  const ordersSentinelRef = useRef<HTMLDivElement | null>(null);

  const [totalProductCount, setTotalProductCount] = useState(0);
  const [totalCustomerCount, setTotalCustomerCount] = useState(0);
  const [orderStats, setOrderStats] = useState({
    totalPaidOrders: 0,
    totalRevenue: 0,
    monthlyPaidOrders: 0,
    monthlyRevenue: 0,
  });

  const [orderStatusTab, setOrderStatusTab] = useState<"paid" | "unpaid">("paid");
  const [orderDateFilter, setOrderDateFilter] = useState<
    "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom"
  >("today");
  const [orderDateRange, setOrderDateRange] = useState<DateRange | undefined>();
  const [orderSearchInput, setOrderSearchInput] = useState("");
  const orderSearchQuery = useDebouncedValue(orderSearchInput, 400);
  const [orderCounts, setOrderCounts] = useState({ paid: 0, unpaid: 0 });
  const [abandonedCarts, setAbandonedCarts] = useState<AdminAbandonedCart[]>([]);
  const [abandonedAfterMinutes, setAbandonedAfterMinutes] = useState(30);
  const [abandonedCartsLoading, setAbandonedCartsLoading] = useState(false);
  const [abandonedCartsLoaded, setAbandonedCartsLoaded] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const PRODUCTS_PAGE_SIZE = 200;
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productSearchInput, setProductSearchInput] = useState("");
  const productSearchQuery = useDebouncedValue(productSearchInput, 400);
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productsLoadingMore, setProductsLoadingMore] = useState(false);
  const [productsHasMore, setProductsHasMore] = useState(true);
  const productsPageRef = useRef(0);
  const loadedProductQueryRef = useRef<string | null>(null);
  const productsSentinelRef = useRef<HTMLDivElement | null>(null);
  const [allProductOptions, setAllProductOptions] = useState<{ id: number; name: string }[]>([]);

  const CUSTOMERS_PAGE_SIZE = 200;
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const customerSearchQuery = useDebouncedValue(customerSearchInput, 400);
  const [customersLoadingMore, setCustomersLoadingMore] = useState(false);
  const [customersHasMore, setCustomersHasMore] = useState(true);
  const customersPageRef = useRef(0);
  const loadedCustomerQueryRef = useRef<string | null>(null);
  const customersSentinelRef = useRef<HTMLDivElement | null>(null);
  const [specialPackages, setSpecialPackages] = useState<SpecialPackageRecord[]>([]);
  const [registries, setRegistries] = useState<RegistryRecord[]>([]);
  const [registryItemsByRegistry, setRegistryItemsByRegistry] = useState<
    Record<string, RegistryItem[]>
  >({});
  const [registrySummaries, setRegistrySummaries] = useState<Record<string, RegistrySummary>>(
    {},
  );
  const [registryPaymentActivities, setRegistryPaymentActivities] = useState<
    Record<string, RegistryPaymentActivity[]>
  >({});
  const [deals, setDeals] = useState<HomeDealRecord[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPostRecord[]>([]);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<
    NewsletterSubscriber[]
  >([]);
  const [newsletterCampaigns, setNewsletterCampaigns] = useState<
    NewsletterCampaign[]
  >([]);
  const [showAddSubscriberModal, setShowAddSubscriberModal] = useState(false);
  const [newSubscriberEmail, setNewSubscriberEmail] = useState("");
  const [savingSubscriber, setSavingSubscriber] = useState(false);
  const [campaignContacts, setCampaignContacts] = useState<CampaignContactRecord[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategoryRecord[]>([]);
  const [shippingTiers, setShippingTiers] = useState<ShippingTier[]>([]);
  const [siteContentSettings, setSiteContentSettings] = useState<SiteContentSettingRecord[]>([]);
  const [storeLocations, setStoreLocations] = useState<StoreLocationRecord[]>([]);
  const [homepageReviews, setHomepageReviews] = useState<HomepageReviewRecord[]>([]);
  const [registryReviews, setRegistryReviews] = useState<HomepageReviewRecord[]>([]);
  const homepageSiteContent = useMemo<HomepageSiteContent>(() => {
    return buildHomepageSiteContent(siteContentSettings);
  }, [siteContentSettings]);
  const [heroImageDraft, setHeroImageDraft] = useState<HomepageImageAsset>(
    homepageSiteContent.heroImage,
  );
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [aboutImageDrafts, setAboutImageDrafts] = useState<AboutImageDraft[]>(
    buildAboutImageDrafts(homepageSiteContent.aboutImages),
  );
  const [savingHomepageContent, setSavingHomepageContent] = useState(false);

  const [showHomepageReviewModal, setShowHomepageReviewModal] = useState(false);
  const [editingHomepageReview, setEditingHomepageReview] = useState<HomepageReviewRecord | null>(null);
  const [homepageReviewName, setHomepageReviewName] = useState("");
  const [homepageReviewRole, setHomepageReviewRole] = useState("");
  const [homepageReviewText, setHomepageReviewText] = useState("");
  const [homepageReviewRating, setHomepageReviewRating] = useState("5");
  const [homepageReviewSortOrder, setHomepageReviewSortOrder] = useState("0");
  const [homepageReviewIsActive, setHomepageReviewIsActive] = useState(true);
  const [savingHomepageReview, setSavingHomepageReview] = useState(false);
  const [showRegistryReviewModal, setShowRegistryReviewModal] = useState(false);
  const [editingRegistryReview, setEditingRegistryReview] = useState<HomepageReviewRecord | null>(null);
  const [registryReviewName, setRegistryReviewName] = useState("");
  const [registryReviewRole, setRegistryReviewRole] = useState("");
  const [registryReviewText, setRegistryReviewText] = useState("");
  const [registryReviewRating, setRegistryReviewRating] = useState("5");
  const [registryReviewSortOrder, setRegistryReviewSortOrder] = useState("0");
  const [registryReviewIsActive, setRegistryReviewIsActive] = useState(true);
  const [savingRegistryReview, setSavingRegistryReview] = useState(false);
  const lastBackgroundRefreshRef = useRef(0);
  const loadedAdminTabsRef = useRef(new Set<string>());

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
  const [productImageFiles, setProductImageFiles] = useState<File[]>([]);
  const [pendingImagePreviews, setPendingImagePreviews] = useState<{ file: File; url: string }[]>([]);
  const [productGalleryImages, setProductGalleryImages] = useState<AdminProductImage[]>([]);
  const [productGalleryAction, setProductGalleryAction] = useState<string | null>(null);
  const [productBrand, setProductBrand] = useState("");
  const [productAgeRange, setProductAgeRange] = useState("");
  const [productHasVariants, setProductHasVariants] = useState(false);
  const [productVariantDrafts, setProductVariantDrafts] = useState<ProductVariantDraft[]>([]);
  const [productDescription, setProductDescription] = useState("");
  const [productInStock, setProductInStock] = useState(true);
  const [productIsFeatured, setProductIsFeatured] = useState(false);
  const [productFeaturedSortOrder, setProductFeaturedSortOrder] = useState("0");
  const [savingProduct, setSavingProduct] = useState(false);

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
  const [shippingTierLabel, setShippingTierLabel] = useState("");
  const [shippingTierFee, setShippingTierFee] = useState("");
  const [shippingTierEta, setShippingTierEta] = useState("");
  const [shippingTierDescription, setShippingTierDescription] = useState("");
  const [shippingTierFulfillmentType, setShippingTierFulfillmentType] = useState<
    "delivery" | "pickup"
  >("delivery");
  const [shippingTierSortOrder, setShippingTierSortOrder] = useState("0");
  const [shippingTierIsActive, setShippingTierIsActive] = useState(true);
  const [savingShippingTier, setSavingShippingTier] = useState(false);

  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SpecialPackageRecord | null>(null);
  const [packageType, setPackageType] = useState<SpecialPackageType>("swoop_package");
  const [packageTitle, setPackageTitle] = useState("");
  const [packageSubtitle, setPackageSubtitle] = useState("");
  const [packageBadgeText, setPackageBadgeText] = useState("");
  const [packageDetails, setPackageDetails] = useState("");
  const [packageVideoUrl, setPackageVideoUrl] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [packageImage, setPackageImage] = useState("");
  const [packageImageFile, setPackageImageFile] = useState<File | null>(null);
  const [packageSortOrder, setPackageSortOrder] = useState("0");
  const [packageIsActive, setPackageIsActive] = useState(true);
  const [savingPackage, setSavingPackage] = useState(false);

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<StoreLocationRecord | null>(null);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationDescription, setLocationDescription] = useState("");
  const [locationPhone, setLocationPhone] = useState("");
  const [locationWhatsappPhone, setLocationWhatsappPhone] = useState("");
  const [locationEmail, setLocationEmail] = useState("");
  const [locationOpeningHours, setLocationOpeningHours] = useState("");
  const [locationHeroImage, setLocationHeroImage] = useState("");
  const [locationHeroImageFile, setLocationHeroImageFile] = useState<File | null>(null);
  const [locationSortOrder, setLocationSortOrder] = useState("0");
  const [locationIsActive, setLocationIsActive] = useState(true);
  const [savingLocation, setSavingLocation] = useState(false);

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

  const fetchProductsPage = useCallback(
    async (reset: boolean) => {
      if (productsLoadingMore) return;
      setProductsLoadingMore(true);

      const page = reset ? 0 : productsPageRef.current;
      const from = page * PRODUCTS_PAGE_SIZE;
      const to = from + PRODUCTS_PAGE_SIZE - 1;

      let query = supabase
        .from("products")
        .select(`${PRODUCT_LIST_SELECT},brand,age_range,has_variants`, { count: "exact" })
        .eq("product_kind", "standard")
        .order("name", { ascending: true })
        .range(from, to);

      if (productSearchQuery.trim()) {
        query = query.ilike("name", `%${productSearchQuery.trim()}%`);
      }
      if (productCategoryFilter !== "all") {
        query = query.eq("category", productCategoryFilter);
      }

      const { data, error, count } = await query;
      const rows = ((error ? [] : data) ?? []) as ProductRecord[];

      setProducts((current) => (reset ? rows : [...current, ...rows]));
      setProductsHasMore(
        typeof count === "number" ? from + rows.length < count : rows.length === PRODUCTS_PAGE_SIZE,
      );
      productsPageRef.current = page + 1;
      setProductsLoadingMore(false);
    },
    [productSearchQuery, productCategoryFilter, productsLoadingMore],
  );

  const fetchCustomersPage = useCallback(
    async (reset: boolean) => {
      if (customersLoadingMore) return;
      setCustomersLoadingMore(true);

      const page = reset ? 0 : customersPageRef.current;
      const from = page * CUSTOMERS_PAGE_SIZE;
      const to = from + CUSTOMERS_PAGE_SIZE - 1;

      let query = supabase
        .from("user_profiles")
        .select("id, full_name, email, phone, shipping_address, account_status, campaign_opt_out, deleted_at, created_at")
        .or("is_admin.eq.false,is_admin.is.null")
        .order("created_at", { ascending: false })
        .range(from, to);

      const trimmedQuery = customerSearchQuery.trim();
      if (trimmedQuery) {
        query = query.or(
          `full_name.ilike.%${trimmedQuery}%,email.ilike.%${trimmedQuery}%,phone.ilike.%${trimmedQuery}%`,
        );
      }

      const { data, error } = await query;
      const rows = ((error ? [] : data) ?? []) as Customer[];

      setCustomers((current) => (reset ? rows : [...current, ...rows]));
      setCustomersHasMore(rows.length === CUSTOMERS_PAGE_SIZE);
      customersPageRef.current = page + 1;
      setCustomersLoadingMore(false);
    },
    [customerSearchQuery, customersLoadingMore],
  );

const resolveOrderDateRange = useCallback((): { from?: Date; to?: Date } => {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  switch (orderDateFilter) {
    case "today":
      return { from: startOfToday, to: startOfToday };
    case "yesterday": {
      const yesterday = new Date(startOfToday);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday, to: yesterday };
    }
    case "last7": {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 6);
      return { from, to: startOfToday };
    }
    case "thisMonth":
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: new Date(today.getFullYear(), today.getMonth() + 1, 0),
      };
    case "lastMonth":
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: new Date(today.getFullYear(), today.getMonth(), 0),
      };
    case "custom":
      return orderDateRange ?? {};
    default:
      return {};
  }
}, [orderDateFilter, orderDateRange]);

type QueryWithDateFilters<T> = {
  gte: (col: string, val: string) => T;
  lte: (col: string, val: string) => T;
};

const applyOrderDateRangeToQuery = useCallback(<T extends QueryWithDateFilters<T>,>(query: T): T => {
  const range = resolveOrderDateRange();
  if (range.from) {
    query = query.gte("created_at", range.from.toISOString());
  }
  if (range.to) {
    const endOfDay = new Date(range.to);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte("created_at", endOfDay.toISOString());
  }
  return query;
}, [resolveOrderDateRange]);

const fetchOrdersPage = useCallback(
  async (reset: boolean) => {
    if (ordersLoadingMore) return;
    setOrdersLoadingMore(true);

    const page = reset ? 0 : ordersPageRef.current;
    const from = page * ORDERS_PAGE_SIZE;
    const to = from + ORDERS_PAGE_SIZE - 1;

    let query = supabase.from("orders").select("*");
    query = orderStatusTab === "paid" ? query.eq("status", "paid") : query.neq("status", "paid");
    query = applyOrderDateRangeToQuery(query);

    const trimmedSearch = orderSearchQuery.trim();
    if (trimmedSearch) {
      query = query.or(
        `customer_name.ilike.%${trimmedSearch}%,customer_email.ilike.%${trimmedSearch}%,customer_phone.ilike.%${trimmedSearch}%`,
      );
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error } = await query;
    const rows = ((error ? [] : data) ?? []) as AdminOrderRecord[];

    setOrders((current) => (reset ? rows : [...current, ...rows]));
    setOrdersHasMore(rows.length === ORDERS_PAGE_SIZE);
    ordersPageRef.current = page + 1;
    setOrdersLoadingMore(false);
  },
  [applyOrderDateRangeToQuery, ordersLoadingMore, orderSearchQuery, orderStatusTab],
);

  const fetchOrderCounts = useCallback(async () => {
    let paidQuery = supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "paid");
    let unpaidQuery = supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "paid");
    paidQuery = applyOrderDateRangeToQuery(paidQuery);
    unpaidQuery = applyOrderDateRangeToQuery(unpaidQuery);

    const [paidResult, unpaidResult] = await Promise.all([paidQuery, unpaidQuery]);
    setOrderCounts({
      paid: paidResult.count ?? 0,
      unpaid: unpaidResult.count ?? 0,
    });
  }, [applyOrderDateRangeToQuery]);

  const fetchDashboardCounts = useCallback(async () => {
    lastBackgroundRefreshRef.current = Date.now();
    const [productCountResult, customerCountResult, orderStatsResult] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("product_kind", "standard"),
      supabase.from("user_profiles").select("id", { count: "exact", head: true }).or("is_admin.eq.false,is_admin.is.null"),
      supabase.rpc("admin_order_stats").single(),
    ]);

    setTotalProductCount(productCountResult.count ?? 0);
    setTotalCustomerCount(customerCountResult.count ?? 0);

    const rawStats = orderStatsResult.data as {
      total_paid_orders: number;
      total_revenue: number;
      monthly_paid_orders: number;
      monthly_revenue: number;
    } | null;

    if (rawStats) {
      setOrderStats({
        totalPaidOrders: Number(rawStats.total_paid_orders ?? 0),
        totalRevenue: Number(rawStats.total_revenue ?? 0),
        monthlyPaidOrders: Number(rawStats.monthly_paid_orders ?? 0),
        monthlyRevenue: Number(rawStats.monthly_revenue ?? 0),
      });
    }
  }, []);

  const loadAdminTabData = useCallback(async (tab: string, force = false) => {
    if (!userId || (!force && loadedAdminTabsRef.current.has(tab))) return;

    if (tab === "registries") {
      const [registriesResult, itemsResult, ordersResult, contributionsResult] = await Promise.all([
        supabase.from("registries").select("id, user_id, name, due_month, baby_gender, share_code, status, fulfillment_status, ready_for_shipping_at, shipped_at, completed_at, created_at").order("created_at", { ascending: false }),
        supabase.from("registry_items").select(`id, registry_id, product_id, product_name_snapshot, product_image_snapshot, product_description_snapshot, requested_quantity, purchased_quantity, funded_amount, unit_price_snapshot, note, created_at, products(${PRODUCT_LIST_SELECT})`).order("created_at", { ascending: false }),
        supabase.from("registry_orders").select("id, registry_id, buyer_name, buyer_email, buyer_phone, buyer_message, total_amount, contribution_type, status, paystack_reference, shipping_address, paid_at, created_at").order("created_at", { ascending: false }),
        supabase.from("registry_contributions").select("id, registry_id, buyer_name, buyer_email, buyer_phone, buyer_message, amount, status, paystack_reference, paid_at, created_at").order("created_at", { ascending: false }),
      ]);
      const nextRegistries = ((registriesResult.error ? [] : registriesResult.data) ?? []) as RegistryRecord[];
      const ownerProfilesResult = nextRegistries.length
        ? await supabase
            .from("user_profiles")
            .select("id, full_name, email, phone, shipping_address")
            .in("id", Array.from(new Set(nextRegistries.map((registry) => registry.user_id))))
        : { data: [], error: null };
      const ownerProfiles =
        ((ownerProfilesResult.error ? [] : ownerProfilesResult.data) ?? []) as Customer[];
      setCustomers((currentCustomers) => {
        const mergedCustomers = new Map(
          currentCustomers.map((customer) => [customer.id, customer]),
        );
        ownerProfiles.forEach((customer) => mergedCustomers.set(customer.id, customer));
        return Array.from(mergedCustomers.values());
      });
      const mappedItems = (((itemsResult.error ? [] : itemsResult.data) ?? []) as unknown as RegistryItemRecord[]).map(mapRegistryItemRecord);
      const itemsByRegistry = mappedItems.reduce<Record<string, RegistryItem[]>>((result, item) => {
        (result[item.registryId] ??= []).push(item);
        return result;
      }, {});
      const nextOrders = ((ordersResult.error ? [] : ordersResult.data) ?? []) as RegistryOrderRecord[];
      const contributions = ((contributionsResult.error ? [] : contributionsResult.data) ?? []) as RegistryContributionRecord[];
      const orderItemsResult = nextOrders.length
        ? await supabase.from("registry_order_items").select("id, registry_order_id, registry_item_id, product_id, quantity, amount, created_at").in("registry_order_id", nextOrders.map((order) => order.id))
        : { data: [], error: null };
      const orderItems = ((orderItemsResult.error ? [] : orderItemsResult.data) ?? []) as RegistryOrderItemRecord[];
      setRegistries(nextRegistries);
      setRegistryItemsByRegistry(itemsByRegistry);
      setRegistrySummaries(Object.fromEntries(Object.entries(itemsByRegistry).map(([id, items]) => [id, summarizeRegistryItems(items)])));
      setRegistryPaymentActivities(nextRegistries.reduce<Record<string, RegistryPaymentActivity[]>>((result, registry) => {
        const matchingOrders = nextOrders.filter((order) => order.registry_id === registry.id);
        result[registry.id] = buildRegistryPaymentActivities({
          contributions: contributions.filter((entry) => entry.registry_id === registry.id),
          orderItems: orderItems.filter((item) => matchingOrders.some((order) => order.id === item.registry_order_id)),
          orders: matchingOrders,
          registryItems: itemsByRegistry[registry.id] ?? [],
        });
        return result;
      }, {}));
    } else if (tab === "newsletter") {
      const [subscribers, campaigns] = await Promise.all([
        supabase.from("newsletter_subscribers").select("id, email, source, is_active, created_at, last_sent_at").order("created_at", { ascending: false }),
        supabase.from("newsletter_campaigns").select("id, campaign_type, subject, status, recipient_count, created_at, sent_at").order("created_at", { ascending: false }),
      ]);
      setNewsletterSubscribers(((subscribers.error ? [] : subscribers.data) ?? []) as NewsletterSubscriber[]);
      setNewsletterCampaigns(((campaigns.error ? [] : campaigns.data) ?? []) as NewsletterCampaign[]);
    } else if (tab === "campaigns") {
      const [contacts, campaigns] = await Promise.all([
        supabase.from("campaign_contacts").select("*").order("created_at", { ascending: false }),
        supabase.from("newsletter_campaigns").select("id, campaign_type, subject, status, recipient_count, created_at, sent_at").order("created_at", { ascending: false }),
      ]);
      setCampaignContacts(((contacts.error ? [] : contacts.data) ?? []) as CampaignContactRecord[]);
      setNewsletterCampaigns(((campaigns.error ? [] : campaigns.data) ?? []) as NewsletterCampaign[]);
    } else if (tab === "products" || tab === "categories") {
      const result = await supabase.from("product_categories").select("id, label, slug, is_active, sort_order, created_at").order("sort_order", { ascending: true });
      setProductCategories(((result.error ? [] : result.data) ?? []) as ProductCategoryRecord[]);
    } else if (tab === "deals") {
      const [dealsResult, productsResult] = await Promise.all([
        supabase.from("homepage_deals").select("id, product_id, title, subtitle, badge_text, override_image, sale_price, compare_at_price, starts_at, ends_at, is_active, sort_order, created_at").order("sort_order", { ascending: true }),
        supabase.from("products").select("id, name").eq("product_kind", "standard").order("name", { ascending: true }),
      ]);
      setDeals(((dealsResult.error ? [] : dealsResult.data) ?? []) as HomeDealRecord[]);
      setAllProductOptions(((productsResult.error ? [] : productsResult.data) ?? []) as { id: number; name: string }[]);
    } else if (tab === "packages") {
      const result = await supabase.from("special_packages").select(`id, product_id, package_type, slug, title, subtitle, badge_text, details, override_image, external_video_url, is_active, sort_order, created_at, updated_at, products(${PRODUCT_LIST_SELECT})`).order("package_type", { ascending: false }).order("sort_order", { ascending: true });
      setSpecialPackages(((result.error ? [] : result.data) ?? []) as SpecialPackageRecord[]);
    } else if (tab === "content") {
      const [settings, locations] = await Promise.all([
        supabase.from("site_content_settings").select("key, value").in("key", ["hero_image", "about_images"]),
        supabase.from("store_locations").select("id, name, slug, address, description, contact_phone, whatsapp_phone, contact_email, opening_hours, hero_image, is_active, sort_order, created_at, updated_at").order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
      ]);
      const nextSettings = ((settings.error ? [] : settings.data) ?? []) as SiteContentSettingRecord[];
      const nextContent = buildHomepageSiteContent(nextSettings);
      setSiteContentSettings(nextSettings);
      setStoreLocations(((locations.error ? [] : locations.data) ?? []) as StoreLocationRecord[]);
      setHeroImageDraft(nextContent.heroImage);
      setHeroImageFile(null);
      setAboutImageDrafts(buildAboutImageDrafts(nextContent.aboutImages));
    } else if (tab === "reviews") {
      const [homepage, registry] = await Promise.all([
        supabase.from("homepage_reviews").select("id, reviewer_name, reviewer_role, review_text, rating, sort_order, is_active, created_at, updated_at").order("sort_order", { ascending: true }),
        supabase.from("registry_reviews").select("id, reviewer_name, reviewer_role, review_text, rating, sort_order, is_active, created_at, updated_at").order("sort_order", { ascending: true }),
      ]);
      setHomepageReviews(((homepage.error ? [] : homepage.data) ?? []) as HomepageReviewRecord[]);
      setRegistryReviews(((registry.error ? [] : registry.data) ?? []) as HomepageReviewRecord[]);
    } else if (tab === "orders" || tab === "shipping") {
      const result = await supabase.from("shipping_tiers").select("id, code, label, fee, eta, description, fulfillment_type, is_active, sort_order, created_at").order("sort_order", { ascending: true });
      setShippingTiers(((result.error ? [] : result.data) ?? []) as ShippingTier[]);
    } else if (tab === "blogs") {
      const result = await supabase.from("blog_posts").select("id, title, slug, category, excerpt, cover_image, body_markdown, author_name, published_at, is_published, created_at, updated_at").order("created_at", { ascending: false });
      setBlogPosts(((result.error ? [] : result.data) ?? []) as BlogPostRecord[]);
    }

    loadedAdminTabsRef.current.add(tab);
  }, [userId]);

useEffect(() => {
  if (adminAccessStatus !== "allowed") return;
  
  const timeoutId = window.setTimeout(() => {
    void fetchDashboardCounts();
  }, 0);

  return () => {
    window.clearTimeout(timeoutId);
  };
}, [adminAccessStatus, fetchDashboardCounts]);

  useEffect(() => {
    if (adminAccessStatus !== "allowed") return;
    const timeoutId = window.setTimeout(() => {
      void loadAdminTabData(activeAdminTab);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeAdminTab, adminAccessStatus, loadAdminTabData]);

  useEffect(() => {
    if (adminAccessStatus !== "allowed" || activeAdminTab !== "orders") return;
    const orderQueryKey = [
      orderStatusTab,
      orderDateFilter,
      orderDateRange?.from?.getTime() ?? "-",
      orderDateRange?.to?.getTime() ?? "-",
      orderSearchQuery,
    ].join(":");
    if (loadedOrderQueryRef.current === orderQueryKey) return;
    loadedOrderQueryRef.current = orderQueryKey;
    ordersPageRef.current = 0;

    const timeoutId = window.setTimeout(() => {
      void fetchOrdersPage(true);
      void fetchOrderCounts();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeAdminTab,
    adminAccessStatus,
    fetchOrderCounts,
    fetchOrdersPage,
    orderDateFilter,
    orderDateRange,
    orderSearchQuery,
    orderStatusTab,
  ]);

  useEffect(() => {
    if (adminAccessStatus !== "allowed" || !["orders", "products", "categories"].includes(activeAdminTab)) return;
    const productQueryKey = `${productSearchQuery}:${productCategoryFilter}`;
    if (loadedProductQueryRef.current === productQueryKey) return;
    loadedProductQueryRef.current = productQueryKey;
    productsPageRef.current = 0;

    const timeoutId = window.setTimeout(() => {
      void fetchProductsPage(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeAdminTab, adminAccessStatus, fetchProductsPage, productSearchQuery, productCategoryFilter]);

  useEffect(() => {
    if (adminAccessStatus !== "allowed" || !["orders", "registries", "customers", "campaigns"].includes(activeAdminTab)) return;
    if (loadedCustomerQueryRef.current === customerSearchQuery) return;
    loadedCustomerQueryRef.current = customerSearchQuery;
    customersPageRef.current = 0;

    const timeoutId = window.setTimeout(() => {
      void fetchCustomersPage(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeAdminTab, adminAccessStatus, fetchCustomersPage, customerSearchQuery]);

  const fetchProductsPageRef = useRef(fetchProductsPage);
useEffect(() => {
  fetchProductsPageRef.current = fetchProductsPage;
}, [fetchProductsPage]);

useEffect(() => {
  const node = productsSentinelRef.current;
  if (!node || !productsHasMore) return;
  const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void fetchProductsPageRef.current(false);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [productsHasMore]);

  const fetchCustomersPageRef = useRef(fetchCustomersPage);
  useEffect(() => {
    fetchCustomersPageRef.current = fetchCustomersPage;
  }, [fetchCustomersPage]);

  useEffect(() => {
    const node = customersSentinelRef.current;
    if (!node || !customersHasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void fetchCustomersPageRef.current(false);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [customersHasMore]);

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

 

  const productCategorySummaryLabel = useMemo(() => {
    if (productCategoriesSelection.length === 0) {
      return "Select categories";
    }

    if (productCategoriesSelection.length <= 2) {
      return productCategoriesSelection.join(", ");
    }

    return `${productCategoriesSelection[0]} +${productCategoriesSelection.length - 1} more`;
  }, [productCategoriesSelection]);

  const toggleProductCategorySelection = (category: string, shouldSelect: boolean) => {
    setProductCategoriesSelection((current) => {
      const alreadySelected = current.includes(category);
      const nextCategories = shouldSelect
        ? alreadySelected
          ? current
          : [...current, category]
        : current.filter((value) => value !== category);

      setProductCategory(nextCategories[0] ?? "");
      return nextCategories;
    });
  };

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
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    if (currentSession?.access_token) {
      return currentSession.access_token;
    }

    return session?.access_token ?? null;
  }, [session]);

  const loadAbandonedCarts = useCallback(async () => {
    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to load abandoned carts.");
      return;
    }

    setAbandonedCartsLoading(true);
    try {
      const response = await fetch("/api/admin/abandoned-carts", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            abandonedAfterMinutes?: number;
            carts?: AdminAbandonedCart[];
            message?: string;
          }
        | null;

      if (!response.ok) {
        toast.error(payload?.message ?? "Could not load abandoned carts.");
        return;
      }

      setAbandonedCarts(payload?.carts ?? []);
      setAbandonedAfterMinutes(payload?.abandonedAfterMinutes ?? 30);
      setAbandonedCartsLoaded(true);
    } catch (error) {
      console.error("Failed to load abandoned carts.", error);
      toast.error("Could not load abandoned carts.");
    } finally {
      setAbandonedCartsLoading(false);
    }
  }, [getAdminAccessToken]);

  useEffect(() => {
    if (
      activeAdminTab !== "abandoned-carts" ||
      abandonedCartsLoaded ||
      adminAccessStatus !== "allowed"
    ) {
      return;
    }

    queueMicrotask(() => {
      void loadAbandonedCarts();
    });
  }, [
    abandonedCartsLoaded,
    activeAdminTab,
    adminAccessStatus,
    loadAbandonedCarts,
  ]);

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
    loadedAdminTabsRef.current.clear();
    loadedOrderQueryRef.current = null;
    loadedProductQueryRef.current = null;
    loadedCustomerQueryRef.current = null;

    queueMicrotask(() => {
      setAdminAccessStatus("checking");
      setLoading(true);
      void (async () => {
        const hasAccess = await verifyAdminAccess();
        if (!hasAccess) {
          setLoading(false);
          return;
        }

        setAdminAccessStatus("allowed");
        setLoading(false);
      })();
    });
  }, [authLoading, userId, verifyAdminAccess]);

  useEffect(() => {
    if (authLoading || !userId || !hasSupabaseEnv) {
      return;
    }

    const refreshDashboardCounts = () => {
      const now = Date.now();
      if (now - lastBackgroundRefreshRef.current < ADMIN_BACKGROUND_REFRESH_INTERVAL_MS) {
        return;
      }

      lastBackgroundRefreshRef.current = now;
      void (async () => {
        const hasAccess = await verifyAdminAccess();
        if (!hasAccess) {
          return;
        }

        await fetchDashboardCounts();
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshDashboardCounts();
      }
    };

    window.addEventListener("focus", refreshDashboardCounts);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshDashboardCounts);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authLoading, fetchDashboardCounts, userId, verifyAdminAccess]);

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

  const uploadAdminContentImage = useCallback(
    async (
      accessToken: string,
      file: File,
      scope: "content" | "packages" | "locations" = "content",
    ) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("scope", scope);

      const response = await fetch("/api/admin/content/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const result = (await response.json().catch(() => null)) as
        | { dataUrl?: string; message?: string; path?: string; url?: string }
        | null;

      const imageUrl = result?.url ?? result?.dataUrl;
      if (!response.ok || !imageUrl) {
        throw new Error(result?.message ?? "Could not upload the image.");
      }

      return imageUrl;
    },
    [],
  );

  const handleSaveHomepageContent = async (event: React.FormEvent) => {
    event.preventDefault();

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage homepage content.");
      return;
    }

    setSavingHomepageContent(true);

    try {
      const nextHeroImage = {
        ...heroImageDraft,
        image: heroImageFile
          ? await uploadAdminContentImage(accessToken, heroImageFile)
          : heroImageDraft.image,
      };

      const nextAboutImages = await Promise.all(
        aboutImageDrafts.map(async (draft) => {
          return {
            image: draft.file
              ? await uploadAdminContentImage(accessToken, draft.file)
              : draft.image,
            alt: draft.alt,
          };
        }),
      );

      const response = await fetch("/api/admin/site-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          entries: [
            { key: "hero_image", value: nextHeroImage },
            { key: "about_images", value: nextAboutImages },
          ],
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not save homepage content.");
        return;
      }

      toast.success(result?.message ?? "Homepage content updated.");
      await revalidatePublicTags(["content"]);
      await loadAdminTabData("content", true);
    } catch (error) {
      console.error("Failed to save homepage content.", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save homepage content.",
      );
    } finally {
      setSavingHomepageContent(false);
    }
  };

  const resetHomepageReviewForm = () => {
    setEditingHomepageReview(null);
    setHomepageReviewName("");
    setHomepageReviewRole("");
    setHomepageReviewText("");
    setHomepageReviewRating("5");
    setHomepageReviewSortOrder("0");
    setHomepageReviewIsActive(true);
  };

  const handleEditHomepageReview = (review: HomepageReviewRecord) => {
    pendingImagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    setPendingImagePreviews([]);
    setEditingHomepageReview(review);
    setHomepageReviewName(review.reviewer_name);
    setHomepageReviewRole(review.reviewer_role ?? "");
    setHomepageReviewText(review.review_text);
    setHomepageReviewRating(String(Number(review.rating ?? 5)));
    setHomepageReviewSortOrder(String(Number(review.sort_order ?? 0)));
    setHomepageReviewIsActive(Boolean(review.is_active));
    setShowHomepageReviewModal(true);
  };

  const handleSaveHomepageReview = async (event: React.FormEvent) => {
    event.preventDefault();

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage homepage reviews.");
      return;
    }

    setSavingHomepageReview(true);

    try {
      const response = await fetch(
        editingHomepageReview
          ? `/api/admin/reviews/${editingHomepageReview.id}`
          : "/api/admin/reviews",
        {
          method: editingHomepageReview ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            reviewerName: homepageReviewName,
            reviewerRole: homepageReviewRole,
            reviewText: homepageReviewText,
            rating: Number(homepageReviewRating || 5),
            sortOrder: Number(homepageReviewSortOrder || 0),
            isActive: homepageReviewIsActive,
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not save the review.");
        return;
      }

      toast.success(
        result?.message ??
          (editingHomepageReview ? "Review updated." : "Review created."),
      );
      setShowHomepageReviewModal(false);
      resetHomepageReviewForm();
      await revalidatePublicTags(["content"]);
      await loadAdminTabData("reviews", true);
    } catch (error) {
      console.error("Failed to save homepage review.", error);
      toast.error("Could not save the review.");
    } finally {
      setSavingHomepageReview(false);
    }
  };

  const handleDeleteHomepageReview = async (reviewId: string) => {
    if (!window.confirm("Delete this homepage review?")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage homepage reviews.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not delete the review.");
        return;
      }

      toast.success(result?.message ?? "Review deleted.");
      await revalidatePublicTags(["content"]);
      await loadAdminTabData("reviews", true);
    } catch (error) {
      console.error("Failed to delete homepage review.", error);
      toast.error("Could not delete the review.");
    }
  };

  const resetRegistryReviewForm = () => {
    setEditingRegistryReview(null);
    setRegistryReviewName("");
    setRegistryReviewRole("");
    setRegistryReviewText("");
    setRegistryReviewRating("5");
    setRegistryReviewSortOrder("0");
    setRegistryReviewIsActive(true);
  };

  const handleEditRegistryReview = (review: HomepageReviewRecord) => {
    setEditingRegistryReview(review);
    setRegistryReviewName(review.reviewer_name);
    setRegistryReviewRole(review.reviewer_role ?? "");
    setRegistryReviewText(review.review_text);
    setRegistryReviewRating(String(Number(review.rating ?? 5)));
    setRegistryReviewSortOrder(String(Number(review.sort_order ?? 0)));
    setRegistryReviewIsActive(Boolean(review.is_active));
    setShowRegistryReviewModal(true);
  };

  const handleSaveRegistryReview = async (event: React.FormEvent) => {
    event.preventDefault();

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage registry reviews.");
      return;
    }

    setSavingRegistryReview(true);

    try {
      const response = await fetch(
        editingRegistryReview
          ? `/api/admin/reviews/${editingRegistryReview.id}?surface=registry`
          : "/api/admin/reviews?surface=registry",
        {
          method: editingRegistryReview ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            reviewerName: registryReviewName,
            reviewerRole: registryReviewRole,
            reviewText: registryReviewText,
            rating: Number(registryReviewRating || 5),
            sortOrder: Number(registryReviewSortOrder || 0),
            isActive: registryReviewIsActive,
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not save the review.");
        return;
      }

      toast.success(
        result?.message ??
          (editingRegistryReview ? "Registry review updated." : "Registry review created."),
      );
      setShowRegistryReviewModal(false);
      resetRegistryReviewForm();
      await revalidatePublicTags(["content"]);
      await loadAdminTabData("reviews", true);
    } catch (error) {
      console.error("Failed to save registry review.", error);
      toast.error("Could not save the review.");
    } finally {
      setSavingRegistryReview(false);
    }
  };

  const handleDeleteRegistryReview = async (reviewId: string) => {
    if (!window.confirm("Delete this registry review?")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage registry reviews.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/reviews/${reviewId}?surface=registry`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not delete the review.");
        return;
      }

      toast.success(result?.message ?? "Registry review deleted.");
      await revalidatePublicTags(["content"]);
      await loadAdminTabData("reviews", true);
    } catch (error) {
      console.error("Failed to delete registry review.", error);
      toast.error("Could not delete the review.");
    }
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
      void Promise.all([fetchCustomersPage(true), fetchDashboardCounts()]);
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
      void Promise.all([fetchCustomersPage(true), fetchDashboardCounts()]);
    } catch (error) {
      console.error("Failed to disable customer.", error);
      toast.error("Could not disable the customer.");
    }
  };

  const resetShippingTierForm = () => {
    setEditingShippingTier(null);
    setShippingTierLabel("");
    setShippingTierFee("");
    setShippingTierEta("");
    setShippingTierDescription("");
    setShippingTierFulfillmentType("delivery");
    setShippingTierSortOrder("0");
    setShippingTierIsActive(true);
  };

  const handleEditShippingTier = (tier: ShippingTier) => {
    setEditingShippingTier(tier);
    setShippingTierLabel(tier.label);
    setShippingTierFee(String(Number(tier.fee ?? 0)));
    setShippingTierEta(tier.eta ?? "");
    setShippingTierDescription(tier.description ?? "");
    setShippingTierFulfillmentType(tier.fulfillment_type === "pickup" ? "pickup" : "delivery");
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
            label: shippingTierLabel,
            fee: Number(shippingTierFee || 0),
            eta: shippingTierEta,
            description: shippingTierDescription,
            fulfillmentType: shippingTierFulfillmentType,
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
      void loadAdminTabData("shipping", true);
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
      void loadAdminTabData("shipping", true);
    } catch (error) {
      console.error("Failed to delete shipping tier.", error);
      toast.error("Could not delete the shipping tier.");
    }
  };

  const resetPackageForm = () => {
    setEditingPackage(null);
    setPackageType("swoop_package");
    setPackageTitle("");
    setPackageSubtitle("");
    setPackageBadgeText("");
    setPackageDetails("");
    setPackageVideoUrl("");
    setPackagePrice("");
    setPackageImage("");
    setPackageImageFile(null);
    setPackageSortOrder("0");
    setPackageIsActive(true);
  };

  const handleEditPackage = (pkg: SpecialPackageRecord) => {
    const packageProduct = Array.isArray(pkg.products)
      ? (pkg.products[0] ?? null)
      : (pkg.products ?? null);
    setEditingPackage(pkg);
    setPackageType(pkg.package_type);
    setPackageTitle(pkg.title);
    setPackageSubtitle(pkg.subtitle ?? "");
    setPackageBadgeText(pkg.badge_text ?? "");
    setPackageDetails(pkg.details ?? "");
    setPackageVideoUrl(pkg.external_video_url ?? "");
    setPackagePrice(
      packageProduct && Number.isFinite(Number(packageProduct.selling_price ?? packageProduct.price))
        ? String(toNairaAmount(Number(packageProduct.selling_price ?? packageProduct.price ?? 0)))
        : "",
    );
    setPackageImage(pkg.override_image ?? "");
    setPackageImageFile(null);
    setPackageSortOrder(String(pkg.sort_order ?? 0));
    setPackageIsActive(Boolean(pkg.is_active));
    setShowPackageModal(true);
  };

  const handleSavePackage = async (event: React.FormEvent) => {
    event.preventDefault();

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage packages.");
      return;
    }

    const nextPrice = Number(packagePrice) / 1000;
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      toast.error("Enter a valid package price.");
      return;
    }

    const nextStoredPackageImage =
      typeof packageImage === "string" && packageImage.trim().length > 0
        ? packageImage.trim()
        : null;
    let nextPackageImage = nextStoredPackageImage;

    if (!packageImageFile && !nextPackageImage) {
      toast.error("Upload a package image file that is 500KB or smaller.");
      return;
    }

    setSavingPackage(true);

    try {
      if (packageImageFile) {
        nextPackageImage = await uploadAdminContentImage(accessToken, packageImageFile, "packages");
      }

      const response = await fetch(
        editingPackage ? `/api/admin/packages/${editingPackage.id}` : "/api/admin/packages",
        {
          method: editingPackage ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            badgeText: packageBadgeText,
            details: packageDetails,
            externalVideoUrl: packageVideoUrl,
            image: nextPackageImage,
            isActive: packageIsActive,
            packageType,
            price: nextPrice,
            sortOrder: Number(packageSortOrder || 0),
            subtitle: packageSubtitle,
            title: packageTitle,
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not save the package.");
        return;
      }

      toast.success(result?.message ?? (editingPackage ? "Package updated." : "Package created."));
      setShowPackageModal(false);
      resetPackageForm();
      await loadAdminTabData("packages", true);
    } catch (error) {
      console.error("Failed to save package.", error);
      toast.error("Could not save the package.");
    } finally {
      setSavingPackage(false);
    }
  };

  const handleDeletePackage = async (pkg: SpecialPackageRecord) => {
    if (!window.confirm("Delete this package?")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage packages.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/packages/${pkg.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not delete the package.");
        return;
      }

      toast.success(result?.message ?? "Package deleted.");
      await loadAdminTabData("packages", true);
    } catch (error) {
      console.error("Failed to delete package.", error);
      toast.error("Could not delete the package.");
    }
  };

  const resetLocationForm = () => {
    setEditingLocation(null);
    setLocationName("");
    setLocationAddress("");
    setLocationDescription("");
    setLocationPhone("");
    setLocationWhatsappPhone("");
    setLocationEmail("");
    setLocationOpeningHours("");
    setLocationHeroImage("");
    setLocationHeroImageFile(null);
    setLocationSortOrder("0");
    setLocationIsActive(true);
  };

  const handleEditLocation = (location: StoreLocationRecord) => {
    setEditingLocation(location);
    setLocationName(location.name);
    setLocationAddress(location.address);
    setLocationDescription(location.description ?? "");
    setLocationPhone(location.contact_phone ?? "");
    setLocationWhatsappPhone(location.whatsapp_phone ?? "");
    setLocationEmail(location.contact_email ?? "");
    setLocationOpeningHours(location.opening_hours ?? "");
    setLocationHeroImage(location.hero_image ?? "");
    setLocationHeroImageFile(null);
    setLocationSortOrder(String(location.sort_order ?? 0));
    setLocationIsActive(Boolean(location.is_active));
    setShowLocationModal(true);
  };

  const handleSaveLocation = async (event: React.FormEvent) => {
    event.preventDefault();

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage locations.");
      return;
    }

    if (!locationName.trim()) {
      toast.error("Enter the location name.");
      return;
    }

    let nextHeroImage = locationHeroImage.trim() || null;
    setSavingLocation(true);

    try {
      if (locationHeroImageFile) {
        nextHeroImage = await uploadAdminContentImage(accessToken, locationHeroImageFile, "locations");
      }

      const response = await fetch(
        editingLocation ? `/api/admin/locations/${editingLocation.id}` : "/api/admin/locations",
        {
          method: editingLocation ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            address: locationAddress,
            contactEmail: locationEmail,
            contactPhone: locationPhone,
            description: locationDescription,
            heroImage: nextHeroImage,
            isActive: locationIsActive,
            name: locationName,
            openingHours: locationOpeningHours,
            sortOrder: Number(locationSortOrder || 0),
            whatsappPhone: locationWhatsappPhone,
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not save the location.");
        return;
      }

      toast.success(result?.message ?? (editingLocation ? "Location updated." : "Location created."));
      setShowLocationModal(false);
      resetLocationForm();
      await loadAdminTabData("content", true);
    } catch (error) {
      console.error("Failed to save location.", error);
      toast.error("Could not save the location.");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleDeleteLocation = async (locationId: string) => {
    if (!window.confirm("Delete this location?")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage locations.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/locations/${locationId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not delete the location.");
        return;
      }

      toast.success(result?.message ?? "Location deleted.");
      await loadAdminTabData("content", true);
    } catch (error) {
      console.error("Failed to delete location.", error);
      toast.error("Could not delete the location.");
    }
  };

  const resetProductForm = () => {
    pendingImagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    setPendingImagePreviews([]);
    const defaultCategory = productCategoryOptions[0] ?? "Toys";
    setEditingProduct(null);
    setProductName("");
    setProductSellingPrice("");
    setProductCostPrice("");
    setProductCategory(defaultCategory);
    setProductCategoriesSelection([defaultCategory]);
    setProductImage("");
    setProductImageFiles([]);
    setProductGalleryImages([]);
    setProductGalleryAction(null);
    setProductBrand("");
    setProductAgeRange("");
    setProductHasVariants(false);
    setProductVariantDrafts([]);
    setProductDescription("");
    setProductInStock(true);
    setProductIsFeatured(false);
    setProductFeaturedSortOrder("0");
  };

  const handleEditProduct = async (product: ProductRecord) => {
    setEditingProduct(product);
    setProductName(product.name);
    setProductSellingPrice(
      String(toNairaAmount(getProductSellingPrice(product))),
    );
    setProductCostPrice(String(toNairaAmount(getProductCostPrice(product))));
    const nextCategories = normalizeProductCategoryLabels(product.category, product.categories);
    setProductCategory(nextCategories[0] ?? product.category);
    setProductCategoriesSelection(nextCategories.length > 0 ? nextCategories : [product.category]);
    setProductImage(product.image ?? "");
    setProductImageFiles([]);
    setProductGalleryImages([]);
    setProductGalleryAction(null);
    setProductBrand(product.brand ?? "");
    setProductAgeRange(product.age_range ?? "");
    setProductHasVariants(Boolean(product.has_variants));
    setProductVariantDrafts([]);
    setProductDescription(product.description);
    setProductInStock(Boolean(product.in_stock));
    setProductIsFeatured(Boolean(product.is_featured));
    setProductFeaturedSortOrder(String(product.featured_sort_order ?? 0));
    setShowProductModal(true);

    const [imagesResult, variantsResult] = await Promise.all([
      supabase
        .from("product_images")
        .select("id, url, thumbnail_url, sort_order, is_primary")
        .eq("product_id", product.id)
        .eq("is_variant_only", false)
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_variants")
        .select(
          "id, size, color, sku, price_override, stock_quantity, in_stock, variant_images:product_images(id, url, thumbnail_url, sort_order)",
        )
        .eq("product_id", product.id)
        .order("created_at", { ascending: true }),
    ]);

    if (!imagesResult.error) {
      const images = (imagesResult.data ?? []) as AdminProductImage[];
      setProductGalleryImages(images);
      const primary = images.find((image) => image.is_primary);
      if (primary?.thumbnail_url) {
        setProductImage(primary.thumbnail_url);
      }
    } else if (imagesResult.error.code !== "42P01") {
      toast.error("Could not load the product gallery.");
    }

    if (!variantsResult.error) {
      setProductVariantDrafts(
        (variantsResult.data ?? []).map((variant) => {
          const variantImages = (Array.isArray(variant.variant_images) ? variant.variant_images : [])
            .slice()
            .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
            .map((image) => ({
              id: String(image.id),
              url: image.url,
              thumbnailUrl: image.thumbnail_url ?? undefined,
            }));

          return {
            color: variant.color ?? "",
            id: variant.id,
            images: variantImages,
            pendingImageFiles: [],
            pendingImagePreviews: [],
            inStock: Boolean(variant.in_stock),
            priceOverride:
              variant.price_override === null || variant.price_override === undefined
                ? ""
                : String(toNairaAmount(Number(variant.price_override))),
            size: variant.size ?? "",
            sku: variant.sku ?? "",
            stockQuantity: String(variant.stock_quantity ?? 0),
          };
        }),
      );
    } else if (variantsResult.error.code !== "42P01") {
      toast.error("Could not load product variants.");
    }
  };

  const applyProductGalleryImages = (images: AdminProductImage[]) => {
    const nextImages = [...images].sort(
      (left, right) => Number(left.sort_order) - Number(right.sort_order),
    );
    setProductGalleryImages(nextImages);
    const primary = nextImages.find((image) => image.is_primary);
    setProductImage(primary?.thumbnail_url ?? nextImages[0]?.thumbnail_url ?? "");
  };

  const handleSetPrimaryProductImage = async (imageId: string) => {
    if (!editingProduct) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to update product images.");
      return;
    }

    setProductGalleryAction(imageId);
    try {
      const response = await fetch(`/api/admin/products/${editingProduct.id}/images`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "set-primary", imageId }),
      });
      const result = (await response.json().catch(() => null)) as
        | { images?: AdminProductImage[]; message?: string }
        | null;
      if (!response.ok) {
        toast.error(result?.message ?? "Could not set the primary product image.");
        return;
      }

      applyProductGalleryImages(result?.images ?? []);
      await revalidatePublicTags(["products"]);
      toast.success("Primary product image updated.");
    } catch (error) {
      console.error("Failed to set the primary product image.", error);
      toast.error("Could not set the primary product image.");
    } finally {
      setProductGalleryAction(null);
    }
  };

  const handleReorderProductImage = async (imageId: string, direction: -1 | 1) => {
    if (!editingProduct) {
      return;
    }

    const currentIndex = productGalleryImages.findIndex((image) => image.id === imageId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= productGalleryImages.length) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to reorder product images.");
      return;
    }

    const nextImages = [...productGalleryImages];
    const [movedImage] = nextImages.splice(currentIndex, 1);
    nextImages.splice(nextIndex, 0, movedImage);
    setProductGalleryAction(imageId);

    try {
      const response = await fetch(`/api/admin/products/${editingProduct.id}/images`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "reorder",
          imageIds: nextImages.map((image) => image.id),
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { images?: AdminProductImage[]; message?: string }
        | null;
      if (!response.ok) {
        toast.error(result?.message ?? "Could not reorder the product gallery.");
        return;
      }

      applyProductGalleryImages(result?.images ?? []);
      await revalidatePublicTags(["products"]);
    } catch (error) {
      console.error("Failed to reorder the product gallery.", error);
      toast.error("Could not reorder the product gallery.");
    } finally {
      setProductGalleryAction(null);
    }
  };

  const handleDeleteProductImage = async (imageId: string) => {
    if (!editingProduct || !window.confirm("Delete this image from the product gallery?")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to delete product images.");
      return;
    }

    setProductGalleryAction(imageId);
    try {
      const response = await fetch(
        `/api/admin/products/${editingProduct.id}/images?imageId=${encodeURIComponent(imageId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const result = (await response.json().catch(() => null)) as
        | { images?: AdminProductImage[]; message?: string }
        | null;
      if (!response.ok) {
        toast.error(result?.message ?? "Could not delete the product image.");
        return;
      }

      applyProductGalleryImages(result?.images ?? []);
      await revalidatePublicTags(["products"]);
      toast.success("Product image deleted.");
    } catch (error) {
      console.error("Failed to delete product image.", error);
      toast.error("Could not delete the product image.");
    } finally {
      setProductGalleryAction(null);
    }
  };

  const handleDeleteVariantImage = async (variantIndex: number, imageId: string) => {
    if (!editingProduct || !window.confirm("Remove this photo from the option?")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to delete variant photos.");
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/products/${editingProduct.id}/images?imageId=${encodeURIComponent(imageId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        toast.error(result?.message ?? "Could not delete the variant photo.");
        return;
      }

      setProductVariantDrafts((currentVariants) =>
        currentVariants.map((variant, index) =>
          index === variantIndex
            ? { ...variant, images: variant.images.filter((image) => image.id !== imageId) }
            : variant,
        ),
      );
      await revalidatePublicTags(["products"]);
      toast.success("Variant photo deleted.");
    } catch (error) {
      console.error("Failed to delete variant photo.", error);
      toast.error("Could not delete the variant photo.");
    }
  };

  const updateProductVariantDraft = (
    index: number,
    patch: Partial<ProductVariantDraft>,
  ) => {
    setProductVariantDrafts((currentVariants) =>
      currentVariants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, ...patch } : variant,
      ),
    );
  };

  const handleProductVariantsToggle = (nextHasVariants: boolean) => {
    if (!nextHasVariants && productVariantDrafts.length > 0) {
      if (!window.confirm("Turning options off will delete every saved variant when you update this product. Continue?")) {
        return;
      }
      setProductVariantDrafts([]);
    }

    setProductHasVariants(nextHasVariants);
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProduct(true);

    try {

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

    if (productImageFiles.length === 0 && !nextProductImage) {
      toast.error("Upload a product image file that is 15MB or smaller.");
      return;
    }

    if (productHasVariants) {
      const hasUsableVariant = productVariantDrafts.some(
        (variant) => variant.size.trim() || variant.color.trim(),
      );
      if (!hasUsableVariant) {
        toast.error(
          "Add at least one size or color option, or uncheck 'selectable size or color options' if this product doesn't need them.",
        );
        return;
      }
    }

    let uploadedProductImages: UploadedProductImage[] = [];

    if (productImageFiles.length > 0) {
      const accessToken = await getAdminAccessToken();
      if (!accessToken) {
        toast.error("Sign in again to upload product images.");
        return;
      }

      const uploadFormData = new FormData();
      for (const imageFile of productImageFiles) {
        uploadFormData.append("images", imageFile);
      }
      if (editingProduct) {
        uploadFormData.append("productId", String(editingProduct.id));
      } else {
        uploadFormData.append(
          "uploadId",
          `upload-${globalThis.crypto.randomUUID?.() ?? Date.now()}`,
        );
      }

      const uploadResponse = await fetch("/api/admin/products/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: uploadFormData,
      });

      const uploadResult = (await uploadResponse.json().catch(() => null)) as
        | {
            images?: Array<{
              path: string;
              thumbnailPath: string;
              thumbnailUrl: string;
              url: string;
            }>;
            message?: string;
          }
        | null;

      const uploadedImages = (uploadResult?.images ?? []).filter(
        (image): image is UploadedProductImage => Boolean(image?.thumbnailUrl),
      );
      if (!uploadResponse.ok || uploadedImages.length !== productImageFiles.length) {
        toast.error(uploadResult?.message ?? "Could not upload the product images.");
        return;
      }

      uploadedProductImages = uploadedImages;
      if (!editingProduct) {
        nextProductImage = uploadedImages[0]?.thumbnailUrl ?? nextProductImage;
      }
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
      brand: productBrand.trim() || null,
      age_range: productAgeRange.trim() || null,
      has_variants: productHasVariants,
      description: productDescription,
      in_stock: productInStock,
      is_featured: productIsFeatured,
      featured_sort_order: Number(productFeaturedSortOrder || 0),
      product_kind: "standard",
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

    if (uploadedProductImages.length > 0) {
      const accessToken = await getAdminAccessToken();
      if (!accessToken) {
        toast.error("Product saved, but its gallery images could not be synchronized. Sign in again and retry the image upload.");
      } else {
        for (const uploadedImage of uploadedProductImages) {
          const imageResponse = await fetch(
            `/api/admin/products/${savedProduct.id}/images`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                mode: "append",
                path: uploadedImage.path,
                thumbnailPath: uploadedImage.thumbnailPath,
              }),
            },
          );
          const imageResult = (await imageResponse.json().catch(() => null)) as
            | { message?: string }
            | null;

          if (!imageResponse.ok && imageResponse.status !== 409) {
            console.error("Gallery image sync failed", {
              status: imageResponse.status,
              result: imageResult,
              path: uploadedImage.path,
              thumbnailPath: uploadedImage.thumbnailPath,
            });
            toast.error(
              imageResult?.message ?? `Gallery image failed to save (status ${imageResponse.status}). Check console.`,
            );
            return;
          }
        }
      }
    }

    const variantAccessToken = await getAdminAccessToken();
    if (!variantAccessToken) {
      toast.error("Product saved, but its variants could not be synchronized. Sign in again and retry.");
      return;
    }

    const variantsResponse = await fetch(
      `/api/admin/products/${savedProduct.id}/variants`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${variantAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deleteExistingVariants: !productHasVariants,
          hasVariants: productHasVariants,
          variants: productVariantDrafts.map((variant) => ({
            color: variant.color,
            id: variant.id,
            inStock: variant.inStock,
            priceOverride: variant.priceOverride
              ? Number(variant.priceOverride) / 1000
              : null,
            size: variant.size,
            sku: variant.sku,
            stockQuantity: variant.stockQuantity,
          })),
        }),
      },
    );
    const variantsResult = (await variantsResponse.json().catch(() => null)) as
      | { message?: string; savedVariantIds?: (string | null)[] }
      | null;
    if (!variantsResponse.ok && variantsResponse.status !== 409) {
      toast.error(
        variantsResult?.message ?? "Product saved, but its variants could not be synchronized.",
      );
      return;
    }

    // Now that every variant has a real id, upload each one's pending photos
    // and tag them to that variant so they can slide through on the storefront.
    const savedVariantIds = variantsResult?.savedVariantIds ?? [];
    for (let variantIndex = 0; variantIndex < productVariantDrafts.length; variantIndex += 1) {
      const variant = productVariantDrafts[variantIndex];
      const variantId = savedVariantIds[variantIndex];
      if (!variantId || variant.pendingImageFiles.length === 0) {
        continue;
      }

      for (const file of variant.pendingImageFiles) {
        const variantUploadFormData = new FormData();
        variantUploadFormData.append("images", file);
        variantUploadFormData.append("productId", String(savedProduct.id));

        const variantUploadResponse = await fetch("/api/admin/products/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${variantAccessToken}`,
          },
          body: variantUploadFormData,
        });
        const variantUploadResult = (await variantUploadResponse.json().catch(() => null)) as
          | { images?: UploadedProductImage[]; message?: string }
          | null;
        const uploadedVariantImage = variantUploadResult?.images?.[0];

        if (!variantUploadResponse.ok || !uploadedVariantImage) {
          toast.error(
            variantUploadResult?.message ?? "Product saved, but one of the variant photos could not be uploaded.",
          );
          continue;
        }

        const attachResponse = await fetch(`/api/admin/products/${savedProduct.id}/images`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${variantAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isVariantOnly: true,
            mode: "append",
            path: uploadedVariantImage.path,
            thumbnailPath: uploadedVariantImage.thumbnailPath,
            variantId,
          }),
        });
        const attachResult = (await attachResponse.json().catch(() => null)) as
          | { message?: string }
          | null;

        if (!attachResponse.ok) {
          toast.error(
            attachResult?.message ?? "Product saved, but one of the variant photos could not be attached.",
          );
        }
      }
    }

    toast.success(editingProduct ? "Product updated." : "Product created.");
    setShowProductModal(false);
    resetProductForm();
    await revalidatePublicTags(["products"]);
    void fetchProductsPage(true);
    void fetchDashboardCounts();

    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!window.confirm("Delete this product?")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to delete products.");
      return;
    }

    const response = await fetch(`/api/admin/products/${productId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const result = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      toast.error(result?.message ?? "Failed to delete product.");
      return;
    }

    toast.success("Product deleted.");
    await revalidatePublicTags(["products"]);
    void fetchProductsPage(true);
    void fetchDashboardCounts();
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

    const existingUploadedImage =
      typeof dealImage === "string" && dealImage.trim().length > 0
        ? dealImage.trim()
        : null;
    let overrideImage = existingUploadedImage;

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
        | { dataUrl?: string; message?: string; path?: string; url?: string }
        | null;
      const uploadedImageUrl = uploadResult?.url ?? uploadResult?.dataUrl;

      if (!uploadResponse.ok || !uploadedImageUrl) {
        toast.error(uploadResult?.message ?? "Could not upload the deal image.");
        return;
      }

      overrideImage = uploadedImageUrl;
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
    void loadAdminTabData("deals", true);
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
    void loadAdminTabData("deals", true);
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
    void loadAdminTabData("blogs", true);
  };

  const handleAddSubscriber = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = newSubscriberEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Enter an email address.");
      return;
    }

    setSavingSubscriber(true);
    const { error } = await supabase.from("newsletter_subscribers").upsert(
      { email, is_active: true, source: "admin" },
      { onConflict: "email" },
    );
    setSavingSubscriber(false);

    if (error) {
      toast.error("Could not add this subscriber.");
      return;
    }

    toast.success("Subscriber added.");
    setNewSubscriberEmail("");
    setShowAddSubscriberModal(false);
    void loadAdminTabData("newsletter", true);
  };

  const handleDeleteSubscriber = async (subscriberId: string) => {
    if (!window.confirm("Remove this subscriber from the newsletter list?")) {
      return;
    }

    const { error } = await supabase
      .from("newsletter_subscribers")
      .delete()
      .eq("id", subscriberId);

    if (error) {
      toast.error("Could not remove this subscriber.");
      return;
    }

    toast.success("Subscriber removed.");
    void loadAdminTabData("newsletter", true);
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
    void loadAdminTabData("blogs", true);
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
      void loadAdminTabData("newsletter", true);
    } catch (error) {
      console.error("Failed to send newsletter.", error);
      toast.error("Failed to send newsletter.");
    } finally {
      setSendingNewsletter(false);
    }
  };

  const handleAdminSectionChange = (section: AdminSectionId) => {
    setActiveAdminTab(section);
    setMobileNavigationOpen(false);
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
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <Tabs
        value={activeAdminTab}
        onValueChange={(value) => handleAdminSectionChange(value as AdminSectionId)}
      >
        <div className="mb-4 lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileNavigationOpen(true)}
            aria-label="Open admin navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
          <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Admin Dashboard</SheetTitle>
            </SheetHeader>
            <div className="px-3 py-5">
              <AdminNavigation
                activeSection={activeAdminTab}
                onSelect={handleAdminSectionChange}
              />
            </div>
          </SheetContent>
        </Sheet>

        <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border bg-white p-3 shadow-sm lg:block">
            <AdminNavigation
              activeSection={activeAdminTab}
              onSelect={handleAdminSectionChange}
            />
          </aside>

          <main className="min-w-0">
            <TabsContent value="overview" className="mt-0 space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                    <Package className="h-4 w-4 text-gray-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{orderStats.totalPaidOrders}</div>
                    <p className="text-xs text-gray-500">
                      {orderStats.monthlyPaidOrders} this month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-gray-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatNairaAmount(orderStats.totalRevenue)}
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatNairaAmount(orderStats.monthlyRevenue)} this month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Customers</CardTitle>
                    <Users className="h-4 w-4 text-gray-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalCustomerCount}</div>
                    <p className="text-xs text-gray-500">Registered users</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Products</CardTitle>
                    <ShoppingBag className="h-4 w-4 text-gray-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalProductCount}</div>
                    <p className="text-xs text-gray-500">Standard catalogue items</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Shortcuts</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      id: "orders" as const,
                      label: "Manage Orders",
                      description: "Paid and unfinished orders",
                      icon: ClipboardList,
                    },
                    {
                      id: "registries" as const,
                      label: "Registry Fulfilment",
                      description: "Ready, shipped and completed",
                      icon: Gift,
                    },
                    {
                      id: "products" as const,
                      label: "Manage Products",
                      description: "Catalogue and inventory",
                      icon: ShoppingBag,
                    },
                    {
                      id: "content" as const,
                      label: "Edit Website",
                      description: "Homepage and locations",
                      icon: FileText,
                    },
                  ].map((shortcut) => {
                    const Icon = shortcut.icon;
                    return (
                      <button
                        key={shortcut.id}
                        type="button"
                        onClick={() => handleAdminSectionChange(shortcut.id)}
                        className="flex items-start gap-3 rounded-xl border px-4 py-4 text-left transition-colors hover:border-pink-200 hover:bg-pink-50"
                      >
                        <Icon className="mt-0.5 h-5 w-5 text-pink-600" />
                        <span>
                          <span className="block text-sm font-semibold text-gray-950">
                            {shortcut.label}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {shortcut.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            <div className="min-h-[55vh]">
        <TabsContent value="orders">
          <div className="space-y-6">
            <AdminOrdersManager
              customers={customers}
              getAdminAccessToken={getAdminAccessToken}
              onReload={() => {
                ordersPageRef.current = 0;
                return Promise.all([fetchOrdersPage(true), fetchOrderCounts()]).then(() => undefined);
              }}
              orders={orders}
              products={products}
              shippingTiers={shippingTiers}
              statusTab={orderStatusTab}
              onStatusTabChange={setOrderStatusTab}
              dateFilter={orderDateFilter}
              onDateFilterChange={setOrderDateFilter}
              dateRange={orderDateRange}
              onDateRangeChange={setOrderDateRange}
              searchInput={orderSearchInput}
              onSearchInputChange={setOrderSearchInput}
              paidCount={orderCounts.paid}
              unpaidCount={orderCounts.unpaid}
              hasMore={ordersHasMore}
              loadingMore={ordersLoadingMore}
              sentinelRef={ordersSentinelRef}
            />
          </div>
        </TabsContent>

        <TabsContent value="abandoned-carts">
          <AdminAbandonedCartsManager
            abandonedAfterMinutes={abandonedAfterMinutes}
            carts={abandonedCarts}
            loading={abandonedCartsLoading}
            onRefresh={() => {
              void loadAbandonedCarts();
            }}
          />
        </TabsContent>

        <TabsContent value="registries">
          <AdminRegistryAccountsManager
            customers={customers}
            registries={registries}
            registryItemsByRegistry={registryItemsByRegistry}
            registryPaymentActivities={registryPaymentActivities}
            registrySummaries={registrySummaries}
          />
        </TabsContent>

        <TabsContent value="customers">
          <Card>
            <CardHeader className="space-y-4">
              <div className="space-y-1 flex items-center justify-between">
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
              </div>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Search customers by name, email, or phone..."
                value={customerSearchInput}
                onChange={(event) => setCustomerSearchInput(event.target.value)}
                className="max-w-sm"
              />
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
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleEditCustomer(customer)}
                    >
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
                            onClick={(event) => {
                              event.stopPropagation();
                              handleEditCustomer(customer);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteCustomer(customer.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {customersHasMore ? (
                <div ref={customersSentinelRef} className="py-4 text-center text-sm text-gray-400">
                  {customersLoadingMore ? "Loading more..." : ""}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="newsletter">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Send Newsletter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
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

            <div className="min-w-0 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Recent Subscribers</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddSubscriberModal(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </Button>
                </CardHeader>
                <CardContent>
                  {newsletterSubscribers.length === 0 ? (
                    <p className="text-sm text-gray-500">No subscribers yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead>Subscribed</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {newsletterSubscribers.slice(0, 8).map((subscriber) => (
                            <TableRow key={subscriber.id}>
                              <TableCell>{subscriber.email}</TableCell>
                              <TableCell>{subscriber.source ?? "Website"}</TableCell>
                              <TableCell>{formatDate(subscriber.created_at)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void handleDeleteSubscriber(subscriber.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
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
                    <div className="overflow-x-auto">
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
                    </div>
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
            onReload={() => loadAdminTabData("campaigns", true)}
          />
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Products</CardTitle>
                </div>
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
              <div className="flex flex-wrap gap-3">
                <Input
                  placeholder="Search products by name..."
                  value={productSearchInput}
                  onChange={(event) => setProductSearchInput(event.target.value)}
                  className="max-w-xs"
                />
                <Select value={productCategoryFilter} onValueChange={setProductCategoryFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {productCategoryOptions.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <TableRow
                      key={product.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => void handleEditProduct(product)}
                    >
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
                            onClick={(event) => {
                            event.stopPropagation();
                            handleEditProduct(product);
                          }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteProduct(product.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {productsHasMore ? (
                <div ref={productsSentinelRef} className="py-4 text-center text-sm text-gray-400">
                  {productsLoadingMore ? "Loading more..." : ""}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <AdminProductCategoriesManager
            categories={productCategories}
            onReload={() => loadAdminTabData("categories", true)}
            onRevalidateProducts={async () => {
              await revalidatePublicTags(["products"]);
            }}
            products={products}
          />
        </TabsContent>

        <TabsContent value="deals">
          <Card>
            <CardHeader className="space-y-4">
              <div className="space-y-1 flex items-center justify-between">
                <CardTitle>Homepage Deals</CardTitle>
                 <Button
                  onClick={() => {
                    resetDealForm();
                    setShowDealModal(true);
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Add Deal
                </Button>
              </div>
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
                    <TableRow
                      key={deal.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleEditDeal(deal)}
                    >
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
                            onClick={(event) => {
                              event.stopPropagation();
                              handleEditDeal(deal);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteDeal(deal.id);
                            }}
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

        <TabsContent value="packages">
          <Card>
            <CardHeader className="space-y-4">
              <div className="space-y-1 flex items-center justify-between">
                <CardTitle>Special Packages</CardTitle>
                <Button
                  onClick={() => {
                    resetPackageForm();
                    setShowPackageModal(true);
                  }}
                >
                  <Package className="mr-2 h-4 w-4" />
                  Add Package
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {specialPackages.length === 0 ? (
                <p className="text-sm text-gray-500">No packages added yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {specialPackages.map((pkg) => {
                      const packageProduct = Array.isArray(pkg.products)
                        ? (pkg.products[0] ?? null)
                        : (pkg.products ?? null);

                      return (
                        <TableRow
                          key={pkg.id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => handleEditPackage(pkg)}
                        >
                          <TableCell>
                            <div className="font-medium">{pkg.title}</div>
                            <div className="text-xs text-gray-500">
                              {pkg.subtitle || "No short description"}
                            </div>
                          </TableCell>
                          <TableCell>{buildSpecialPackageTypeLabel(pkg.package_type)}</TableCell>
                          <TableCell>
                            {packageProduct
                              ? formatNaira(getProductSellingPrice(packageProduct))
                              : "N/A"}
                          </TableCell>
                          <TableCell>{Number(pkg.sort_order ?? 0)}</TableCell>
                          <TableCell>{pkg.is_active ? "Active" : "Inactive"}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleEditPackage(pkg);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeletePackage(pkg);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-pink-100 p-2 text-pink-600">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>Homepage Visual Content</CardTitle>
                    <p className="mt-1 text-sm text-gray-500">
                      Update the main hero image and the four gallery images in the About section.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveHomepageContent} className="space-y-8">
                  <div className="space-y-4 rounded-2xl border border-rose-100 bg-rose-50/40 p-5">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Hero Image</h3>
                      <p className="text-sm text-gray-500">
                        This image appears in the main homepage hero banner.
                      </p>
                    </div>
                    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="overflow-hidden rounded-2xl border border-rose-100 bg-white">
                        <img
                          src={heroImageDraft.image}
                          alt={heroImageDraft.alt}
                          loading="lazy"
                          decoding="async"
                          className="h-56 w-full object-cover"
                        />
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="hero-image-upload">Upload Hero Image</Label>
                          <Input
                            id="hero-image-upload"
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              setHeroImageFile(event.target.files?.[0] ?? null)
                            }
                          />
                          <p className="text-xs text-gray-500">
                            Upload an image file up to 500KB. The current image stays in place until you save.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="hero-image-alt">Hero Image Alt Text</Label>
                          <Input
                            id="hero-image-alt"
                            value={heroImageDraft.alt}
                            onChange={(event) =>
                              setHeroImageDraft((current) => ({
                                ...current,
                                alt: event.target.value,
                              }))
                            }
                            placeholder="Happy baby with toys"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-rose-100 bg-white p-5">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">About Gallery Images</h3>
                      <p className="text-sm text-gray-500">
                        These four images appear in the About section on the homepage.
                      </p>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2">
                      {aboutImageDrafts.map((imageDraft, index) => (
                        <div
                          key={`about-image-${index}`}
                          className="space-y-4 rounded-2xl border border-gray-100 p-4"
                        >
                          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                            <img
                              src={imageDraft.image}
                              alt={imageDraft.alt}
                              loading="lazy"
                              decoding="async"
                              className="h-48 w-full object-cover"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`about-image-upload-${index}`}>
                              Upload About Image {index + 1}
                            </Label>
                            <Input
                              id={`about-image-upload-${index}`}
                              type="file"
                              accept="image/*"
                              onChange={(event) =>
                                setAboutImageDrafts((currentDrafts) =>
                                  currentDrafts.map((currentDraft, currentIndex) =>
                                    currentIndex === index
                                      ? {
                                          ...currentDraft,
                                          file: event.target.files?.[0] ?? null,
                                        }
                                      : currentDraft,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`about-image-alt-${index}`}>Alt Text</Label>
                            <Input
                              id={`about-image-alt-${index}`}
                              value={imageDraft.alt}
                              onChange={(event) =>
                                setAboutImageDrafts((currentDrafts) =>
                                  currentDrafts.map((currentDraft, currentIndex) =>
                                    currentIndex === index
                                      ? { ...currentDraft, alt: event.target.value }
                                      : currentDraft,
                                  ),
                                )
                              }
                              placeholder={`About image ${index + 1} description`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button type="submit" disabled={savingHomepageContent}>
                    {savingHomepageContent ? "Saving Content..." : "Save Homepage Content"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-4">
                <div className="space-y-1">
                  <CardTitle>Store Locations</CardTitle>
                  <p className="text-sm text-gray-500">
                    Add the locations shown on the locations page and control each location image, contact details, WhatsApp, and opening hours.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      resetLocationForm();
                      setShowLocationModal(true);
                    }}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Add Location
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {storeLocations.length === 0 ? (
                  <p className="text-sm text-gray-500">No locations added yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {storeLocations.map((location) => (
                        <TableRow key={location.id}>
                          <TableCell>
                            <div className="font-medium">{location.name}</div>
                            <div className="text-xs text-gray-500">
                              /locations?location={location.slug}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{location.contact_phone || "No phone"}</div>
                            <div className="text-xs text-gray-500">
                              {location.whatsapp_phone || "No WhatsApp"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {location.contact_email || "No email"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {splitLocationOpeningHours(location.opening_hours).slice(0, 2).join(", ") || "No hours yet"}
                          </TableCell>
                          <TableCell>{Number(location.sort_order ?? 0)}</TableCell>
                          <TableCell>{location.is_active ? "Active" : "Inactive"}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditLocation(location)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => void handleDeleteLocation(location.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reviews">
          <div className="space-y-6">
            <Card>
              <CardHeader className="space-y-4">
                <div className="space-y-1">
                  <CardTitle>Homepage Reviews</CardTitle>
                  <p className="text-sm text-gray-500">
                    Add and manage parent testimonials shown on the homepage review section.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      resetHomepageReviewForm();
                      setShowHomepageReviewModal(true);
                    }}
                  >
                    <MessageSquareQuote className="mr-2 h-4 w-4" />
                    Add Review
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reviewer</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Review</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(homepageReviews ?? []).map((review) => (
                      <TableRow
                        key={review.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleEditHomepageReview(review)}
                      >
                        <TableCell>
                          <div className="font-medium">{review.reviewer_name}</div>
                          <div className="text-xs text-gray-500">
                            {review.reviewer_role || "No reviewer role"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-amber-500">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <Star
                                key={`${review.id}-admin-star-${index}`}
                                className="h-4 w-4"
                                fill={index < Number(review.rating ?? 5) ? "currentColor" : "none"}
                              />
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="line-clamp-3 text-sm text-gray-600">
                            {review.review_text}
                          </p>
                        </TableCell>
                        <TableCell>{Number(review.sort_order ?? 0)}</TableCell>
                        <TableCell>{review.is_active ? "Active" : "Inactive"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEditHomepageReview(review);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteHomepageReview(review.id);
                              }}
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

            <Card>
              <CardHeader className="space-y-4">
                <div className="space-y-1 flex items-center justify-between">
                  <CardTitle>Registry Reviews</CardTitle>
                  <Button
                    onClick={() => {
                      resetRegistryReviewForm();
                      setShowRegistryReviewModal(true);
                    }}
                  >
                    <MessageSquareQuote className="mr-2 h-4 w-4" />
                    Add Registry Review
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reviewer</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Review</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(registryReviews ?? []).map((review) => (
                      <TableRow
                        key={review.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleEditRegistryReview(review)}
                      >
                        <TableCell>
                          <div className="font-medium">{review.reviewer_name}</div>
                          <div className="text-xs text-gray-500">
                            {review.reviewer_role || "No reviewer role"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-amber-500">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <Star
                                key={`${review.id}-registry-star-${index}`}
                                className="h-4 w-4"
                                fill={index < Number(review.rating ?? 5) ? "currentColor" : "none"}
                              />
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="line-clamp-3 text-sm text-gray-600">
                            {review.review_text}
                          </p>
                        </TableCell>
                        <TableCell>{Number(review.sort_order ?? 0)}</TableCell>
                        <TableCell>{review.is_active ? "Active" : "Inactive"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEditRegistryReview(review);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteRegistryReview(review.id);
                              }}
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
          </div>
        </TabsContent>

        <TabsContent value="shipping">
          <Card>
            <CardHeader className="space-y-4">
              <div className="space-y-1 flex items-center justify-between">
                <CardTitle>Shipping Tiers</CardTitle>
                <Button
                  onClick={() => {
                    resetShippingTierForm();
                    setShowShippingTierModal(true);
                  }}
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  Add Shipping Tier
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shipping Option</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Display Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shippingTiers.map((tier) => (
                    <TableRow
                      key={tier.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleEditShippingTier(tier)}
                    >
                      <TableCell>
                        <div className="font-medium">{tier.label}</div>
                        <div className="text-xs text-gray-500">
                          {(tier.fulfillment_type === "pickup" ? "Pickup" : "Delivery") +
                            (tier.description ? ` • ${tier.description}` : "")}
                        </div>
                      </TableCell>
                      <TableCell>{formatNairaAmount(Number(tier.fee ?? 0))}</TableCell>
                      <TableCell>{tier.eta || "N/A"}</TableCell>
                      <TableCell>{Number(tier.sort_order ?? 0)}</TableCell>
                      <TableCell>{tier.is_active ? "Active" : "Inactive"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleEditShippingTier(tier);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteShippingTier(tier.id);
                            }}
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
            <CardHeader className="space-y-4">
              <div className="space-y-1 flex items-center justify-between">
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
              </div>
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
                    <TableRow
                      key={post.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleEditBlog(post)}
                    >
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
                            onClick={(event) => {
                              event.stopPropagation();
                              handleEditBlog(post);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {post.is_published ? (
                            <Button asChild variant="outline" size="sm">
                              <a
                                href={`/blog/${post.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          ) : null}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteBlog(post.id);
                            }}
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
            </div>
          </main>
        </div>
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

      <Dialog open={showAddSubscriberModal} onOpenChange={setShowAddSubscriberModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Newsletter Subscriber</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubscriber} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-subscriber-email">Email</Label>
              <Input
                id="new-subscriber-email"
                type="email"
                value={newSubscriberEmail}
                onChange={(event) => setNewSubscriberEmail(event.target.value)}
                placeholder="subscriber@example.com"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={savingSubscriber}>
              {savingSubscriber ? "Adding..." : "Add Subscriber"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showShippingTierModal} onOpenChange={setShowShippingTierModal}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingShippingTier ? "Edit Shipping Tier" : "Add Shipping Tier"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveShippingTier} className="space-y-4">
            <p className="text-sm text-gray-500">
              Customers only choose from the shipping options you create here. The internal code is generated automatically for you.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shipping-tier-label">Customer Label</Label>
                <Input
                  id="shipping-tier-label"
                  value={shippingTierLabel}
                  onChange={(event) => setShippingTierLabel(event.target.value)}
                  placeholder="Lagos Standard Delivery"
                  required
                />
                <p className="text-xs text-gray-500">
                  Example: Lagos Same Day, Lagos Standard, Abuja Express, or Other States Delivery.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shipping-tier-eta">Estimated Delivery Time</Label>
                <Input
                  id="shipping-tier-eta"
                  value={shippingTierEta}
                  onChange={(event) => setShippingTierEta(event.target.value)}
                  placeholder="2-3 days"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shipping-tier-fulfillment">Fulfillment Type</Label>
                <Select
                  value={shippingTierFulfillmentType}
                  onValueChange={(value) =>
                    setShippingTierFulfillmentType(value as "delivery" | "pickup")
                  }
                >
                  <SelectTrigger id="shipping-tier-fulfillment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="pickup">Pickup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shipping-tier-fee">Fee (NGN)</Label>
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
                <Label htmlFor="shipping-tier-sort-order">Display Order</Label>
                <Input
                  id="shipping-tier-sort-order"
                  type="number"
                  min="0"
                  value={shippingTierSortOrder}
                  onChange={(event) => setShippingTierSortOrder(event.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Lower numbers appear first. Use this to keep Lagos options or pickup choices where you want them.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shipping-tier-description">Checkout Description</Label>
              <Textarea
                id="shipping-tier-description"
                value={shippingTierDescription}
                onChange={(event) => setShippingTierDescription(event.target.value)}
                rows={3}
                placeholder="Fast delivery within Lagos."
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={shippingTierIsActive}
                onChange={(event) => setShippingTierIsActive(event.target.checked)}
              />
              Show this shipping option to customers
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

      <Dialog open={showPackageModal} onOpenChange={setShowPackageModal}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? "Edit Special Package" : "Add Special Package"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePackage} className="space-y-4">
            <p className="text-sm text-gray-500">
              Packages appear in the `Special Packages` section above the deal carousel and can be added directly to cart or registry.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="package-type">Package Type</Label>
                <Select
                  value={packageType}
                  onValueChange={(value) => setPackageType(value as SpecialPackageType)}
                >
                  <SelectTrigger id="package-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIAL_PACKAGE_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {buildSpecialPackageTypeLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="package-price">Price (NGN)</Label>
                <Input
                  id="package-price"
                  type="number"
                  min="0"
                  value={packagePrice}
                  onChange={(event) => setPackagePrice(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="package-title">Package Title</Label>
                <Input
                  id="package-title"
                  value={packageTitle}
                  onChange={(event) => setPackageTitle(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="package-badge">Badge Text</Label>
                <Input
                  id="package-badge"
                  value={packageBadgeText}
                  onChange={(event) => setPackageBadgeText(event.target.value)}
                  placeholder="Best for newborn setup"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="package-subtitle">Short Description</Label>
              <Textarea
                id="package-subtitle"
                value={packageSubtitle}
                onChange={(event) => setPackageSubtitle(event.target.value)}
                rows={3}
                placeholder="A ready-to-checkout package for new parents."
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="package-details">Details / Included Items</Label>
              <Textarea
                id="package-details"
                value={packageDetails}
                onChange={(event) => setPackageDetails(event.target.value)}
                rows={6}
                placeholder={"Use one line per included item or package detail.\nCot set\nBath essentials\nNewborn clothing pack"}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="package-video-url">External Video Link</Label>
                <Input
                  id="package-video-url"
                  value={packageVideoUrl}
                  onChange={(event) => setPackageVideoUrl(event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="package-sort-order">Display Order</Label>
                <Input
                  id="package-sort-order"
                  type="number"
                  min="0"
                  value={packageSortOrder}
                  onChange={(event) => setPackageSortOrder(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="package-image">Package Image Upload</Label>
              <Input
                id="package-image"
                type="file"
                accept="image/*"
                onChange={(event) => setPackageImageFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-gray-500">
                Upload an image file up to 500KB. The package image is also used for checkout and registry views.
              </p>
              {packageImage ? (
                <div className="overflow-hidden rounded-2xl border">
                  <img
                    src={packageImage}
                    alt={packageTitle || "Package preview"}
                    loading="lazy"
                    decoding="async"
                    className="h-56 w-full object-cover"
                  />
                </div>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={packageIsActive}
                onChange={(event) => setPackageIsActive(event.target.checked)}
              />
              Show this package to customers
            </label>

            <Button type="submit" className="w-full" disabled={savingPackage}>
              {savingPackage
                ? "Saving..."
                : editingPackage
                  ? "Update Package"
                  : "Create Package"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showLocationModal} onOpenChange={setShowLocationModal}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? "Edit Store Location" : "Add Store Location"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveLocation} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location-name">Location Name</Label>
                <Input
                  id="location-name"
                  value={locationName}
                  onChange={(event) => setLocationName(event.target.value)}
                  placeholder="Lekki Store"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location-sort-order">Display Order</Label>
                <Input
                  id="location-sort-order"
                  type="number"
                  min="0"
                  value={locationSortOrder}
                  onChange={(event) => setLocationSortOrder(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-address">Address</Label>
              <Textarea
                id="location-address"
                value={locationAddress}
                onChange={(event) => setLocationAddress(event.target.value)}
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-description">Description</Label>
              <Textarea
                id="location-description"
                value={locationDescription}
                onChange={(event) => setLocationDescription(event.target.value)}
                rows={4}
                placeholder="Share what customers can expect at this location."
              />
            </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="location-phone">Contact Phone</Label>
                  <Input
                    id="location-phone"
                    value={locationPhone}
                    onChange={(event) => setLocationPhone(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location-whatsapp-phone">WhatsApp Phone</Label>
                  <Input
                    id="location-whatsapp-phone"
                    value={locationWhatsappPhone}
                    onChange={(event) => setLocationWhatsappPhone(event.target.value)}
                    placeholder="+234 802 474 0159"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location-email">Contact Email</Label>
                  <Input
                  id="location-email"
                  type="email"
                  value={locationEmail}
                  onChange={(event) => setLocationEmail(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-hours">Opening Hours</Label>
              <Textarea
                id="location-hours"
                value={locationOpeningHours}
                onChange={(event) => setLocationOpeningHours(event.target.value)}
                rows={5}
                placeholder={"Monday - Friday: 9:00 AM - 6:00 PM\nSaturday: 10:00 AM - 5:00 PM"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-image">Location Image Upload</Label>
              <Input
                id="location-image"
                type="file"
                accept="image/*"
                onChange={(event) => setLocationHeroImageFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-gray-500">
                Upload an image file up to 500KB for the location page hero.
              </p>
              {locationHeroImage ? (
                <div className="overflow-hidden rounded-2xl border">
                  <img
                    src={locationHeroImage}
                    alt={locationName || "Location preview"}
                    loading="lazy"
                    decoding="async"
                    className="h-56 w-full object-cover"
                  />
                </div>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={locationIsActive}
                onChange={(event) => setLocationIsActive(event.target.checked)}
              />
              Show this location to customers
            </label>

            <Button type="submit" className="w-full" disabled={savingLocation}>
              {savingLocation
                ? "Saving..."
                : editingLocation
                  ? "Update Location"
                  : "Create Location"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showHomepageReviewModal} onOpenChange={setShowHomepageReviewModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingHomepageReview ? "Edit Homepage Review" : "Add Homepage Review"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveHomepageReview} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="homepage-review-name">Reviewer Name</Label>
                <Input
                  id="homepage-review-name"
                  value={homepageReviewName}
                  onChange={(event) => setHomepageReviewName(event.target.value)}
                  placeholder="Amaka O."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="homepage-review-role">Reviewer Role / Context</Label>
                <Input
                  id="homepage-review-role"
                  value={homepageReviewRole}
                  onChange={(event) => setHomepageReviewRole(event.target.value)}
                  placeholder="First-time mum in Lagos"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="homepage-review-text">Review Text</Label>
              <Textarea
                id="homepage-review-text"
                value={homepageReviewText}
                onChange={(event) => setHomepageReviewText(event.target.value)}
                rows={5}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="homepage-review-rating">Rating</Label>
                <Select value={homepageReviewRating} onValueChange={setHomepageReviewRating}>
                  <SelectTrigger id="homepage-review-rating">
                    <SelectValue placeholder="Select a rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 Stars</SelectItem>
                    <SelectItem value="4">4 Stars</SelectItem>
                    <SelectItem value="3">3 Stars</SelectItem>
                    <SelectItem value="2">2 Stars</SelectItem>
                    <SelectItem value="1">1 Star</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="homepage-review-sort-order">Display Order</Label>
                <Input
                  id="homepage-review-sort-order"
                  type="number"
                  min="0"
                  value={homepageReviewSortOrder}
                  onChange={(event) => setHomepageReviewSortOrder(event.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={homepageReviewIsActive}
                onChange={(event) => setHomepageReviewIsActive(event.target.checked)}
              />
              Show this review on the homepage
            </label>

            <Button type="submit" className="w-full" disabled={savingHomepageReview}>
              {savingHomepageReview
                ? "Saving..."
                : editingHomepageReview
                  ? "Update Review"
                  : "Create Review"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showRegistryReviewModal} onOpenChange={setShowRegistryReviewModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRegistryReview ? "Edit Registry Review" : "Add Registry Review"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRegistryReview} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registry-review-name">Reviewer Name</Label>
                <Input
                  id="registry-review-name"
                  value={registryReviewName}
                  onChange={(event) => setRegistryReviewName(event.target.value)}
                  placeholder="Ada N."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="registry-review-role">Reviewer Role / Context</Label>
                <Input
                  id="registry-review-role"
                  value={registryReviewRole}
                  onChange={(event) => setRegistryReviewRole(event.target.value)}
                  placeholder="Mum-to-be building her first registry"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="registry-review-text">Review Text</Label>
              <Textarea
                id="registry-review-text"
                value={registryReviewText}
                onChange={(event) => setRegistryReviewText(event.target.value)}
                rows={5}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registry-review-rating">Rating</Label>
                <Select value={registryReviewRating} onValueChange={setRegistryReviewRating}>
                  <SelectTrigger id="registry-review-rating">
                    <SelectValue placeholder="Select a rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 Stars</SelectItem>
                    <SelectItem value="4">4 Stars</SelectItem>
                    <SelectItem value="3">3 Stars</SelectItem>
                    <SelectItem value="2">2 Stars</SelectItem>
                    <SelectItem value="1">1 Star</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="registry-review-sort-order">Display Order</Label>
                <Input
                  id="registry-review-sort-order"
                  type="number"
                  min="0"
                  value={registryReviewSortOrder}
                  onChange={(event) => setRegistryReviewSortOrder(event.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={registryReviewIsActive}
                onChange={(event) => setRegistryReviewIsActive(event.target.checked)}
              />
              Show this review on the registry page
            </label>

            <Button type="submit" className="w-full" disabled={savingRegistryReview}>
              {savingRegistryReview
                ? "Saving..."
                : editingRegistryReview
                  ? "Update Review"
                  : "Create Review"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
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

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>Categories</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                    >
                      <span className="truncate text-left">
                        {productCategorySummaryLabel}
                      </span>
                      <div className="ml-3 flex shrink-0 items-center gap-2 text-xs text-gray-500">
                        <span>{productCategoriesSelection.length} selected</span>
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[16rem] max-w-[calc(100vw-2rem)]"
                  >
                    {productCategoryOptions.map((category) => (
                      <DropdownMenuCheckboxItem
                        key={category}
                        checked={productCategoriesSelection.includes(category)}
                        onCheckedChange={(checked) =>
                          toggleProductCategorySelection(category, checked === true)
                        }
                        onSelect={(event) => event.preventDefault()}
                      >
                        {category}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-gray-500">
                  Choose one or more categories. The first selected one stays the primary product category.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-brand">Brand (optional)</Label>
                <Input
                  id="product-brand"
                  value={productBrand}
                  onChange={(event) => setProductBrand(event.target.value)}
                  placeholder="e.g. Tommee Tippee"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-age-range">Age range (optional)</Label>
                <Input
                  id="product-age-range"
                  value={productAgeRange}
                  onChange={(event) => setProductAgeRange(event.target.value)}
                  placeholder="e.g. 0-6 months"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-image">Product Images</Label>
              <Input
                id="product-image"
                type="file"
                accept="image/*"
                multiple
                required={!editingProduct && !productImage && productImageFiles.length === 0}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setPendingImagePreviews((current) => {
                    current.forEach((preview) => URL.revokeObjectURL(preview.url));
                    return files.map((file) => ({ file, url: URL.createObjectURL(file) }));
                  });
                  setProductImageFiles(files);
                }}
              />
              <p className="text-xs text-gray-500">
                Upload one or more images 
              </p>
              {pendingImagePreviews.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-gray-500">
                    {pendingImagePreviews.length} new image{pendingImagePreviews.length === 1 ? "" : "s"} will be added when you save this product.
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {pendingImagePreviews.map((preview, index) => (
                      <div key={preview.url} className="overflow-hidden rounded-lg border bg-white">
                        <img
                          src={preview.url}
                          alt={`New image ${index + 1}`}
                          loading="lazy"
                          decoding="async"
                          className="aspect-square w-full object-cover"
                        />
                        <div className="flex items-center justify-between gap-1 p-2">
                          <span className="truncate text-xs text-gray-600">Pending {index + 1}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 text-red-600"
                            title="Remove this image"
                            aria-label="Remove this image"
                            onClick={() => {
                              URL.revokeObjectURL(preview.url);
                              setPendingImagePreviews((current) => current.filter((_, i) => i !== index));
                              setProductImageFiles((current) => current.filter((_, i) => i !== index));
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {editingProduct && productGalleryImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
                  {productGalleryImages.map((image, index) => (
                    <div key={image.id} className="overflow-hidden rounded-lg border bg-white">
                      <ImageWithFallback
                        src={`${image.thumbnail_url || image.url}?v=${image.id}`}
                        alt={`${productName} image ${index + 1}`}
                        className="aspect-square w-full object-cover"
                      />
                      <div className="flex items-center justify-between gap-1 p-2">
                        <span className="truncate text-xs text-gray-600">
                          {image.is_primary ? "Primary" : `Image ${index + 1}`}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant={image.is_primary ? "default" : "outline"}
                            className="h-7 w-7"
                            title="Set as primary image"
                            aria-label="Set as primary image"
                            disabled={Boolean(productGalleryAction) || image.is_primary}
                            onClick={() => void handleSetPrimaryProductImage(image.id)}
                          >
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            title="Move image earlier"
                            aria-label="Move image earlier"
                            disabled={Boolean(productGalleryAction) || index === 0}
                            onClick={() => void handleReorderProductImage(image.id, -1)}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            title="Move image later"
                            aria-label="Move image later"
                            disabled={
                              Boolean(productGalleryAction) ||
                              index === productGalleryImages.length - 1
                            }
                            onClick={() => void handleReorderProductImage(image.id, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 text-red-600"
                            title="Delete image"
                            aria-label="Delete image"
                            disabled={Boolean(productGalleryAction)}
                            onClick={() => void handleDeleteProductImage(image.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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

            <div className="space-y-3 rounded-lg border border-pink-100 bg-pink-50/50 p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <input
                  type="checkbox"
                  checked={productHasVariants}
                  onChange={(event) => handleProductVariantsToggle(event.target.checked)}
                />
                This product has selectable size or color options
              </label>

              {productHasVariants ? (
                <div className="space-y-3">
                  {productVariantDrafts.map((variant, index) => {
                    return (
                    <div
                      key={variant.id ?? `new-variant-${index}`}
                      className="space-y-2 rounded-md border bg-white p-3"
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_0.8fr_0.9fr_auto]">
                      <Input
                        aria-label={`Variant ${index + 1} size`}
                        value={variant.size}
                        onChange={(event) => updateProductVariantDraft(index, { size: event.target.value })}
                        placeholder="Size"
                      />
                      <Input
                        aria-label={`Variant ${index + 1} color`}
                        value={variant.color}
                        onChange={(event) => updateProductVariantDraft(index, { color: event.target.value })}
                        placeholder="Color"
                      />
                      <Input
                        aria-label={`Variant ${index + 1} SKU`}
                        value={variant.sku}
                        onChange={(event) => updateProductVariantDraft(index, { sku: event.target.value })}
                        placeholder="SKU"
                      />
                      <Input
                        aria-label={`Variant ${index + 1} stock quantity`}
                        type="number"
                        min="0"
                        value={variant.stockQuantity}
                        onChange={(event) => updateProductVariantDraft(index, { stockQuantity: event.target.value })}
                        placeholder="Stock (optional)"
                      />
                      <Input
                        aria-label={`Variant ${index + 1} price override in Naira`}
                        type="number"
                        min="0"
                        value={variant.priceOverride}
                        onChange={(event) => updateProductVariantDraft(index, { priceOverride: event.target.value })}
                        placeholder="Price override (NGN)"
                      />
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={variant.inStock}
                            onChange={(event) => updateProductVariantDraft(index, { inStock: event.target.checked })}
                          />
                          In stock
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-red-600"
                          title="Remove variant"
                          aria-label="Remove variant"
                          onClick={() =>
                            setProductVariantDrafts((currentVariants) =>
                              currentVariants.filter((_, variantIndex) => variantIndex !== index),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {variant.images.map((image) => (
                            <div key={image.id} className="group relative h-14 w-14 shrink-0">
                              <img
                                src={image.thumbnailUrl || image.url}
                                alt={`Variant ${index + 1} photo`}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full rounded-md border object-cover"
                              />
                              <button
                                type="button"
                                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-white text-red-600 shadow-sm"
                                title="Remove photo"
                                aria-label="Remove photo"
                                onClick={() => void handleDeleteVariantImage(index, image.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {variant.pendingImagePreviews.map((previewUrl, previewIndex) => (
                            <div key={previewUrl} className="group relative h-14 w-14 shrink-0">
                              <img
                                src={previewUrl}
                                alt={`Variant ${index + 1} pending photo`}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full rounded-md border-2 border-dashed object-cover opacity-80"
                              />
                              <button
                                type="button"
                                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-white text-red-600 shadow-sm"
                                title="Remove photo"
                                aria-label="Remove photo"
                                onClick={() => {
                                  URL.revokeObjectURL(previewUrl);
                                  updateProductVariantDraft(index, {
                                    pendingImageFiles: variant.pendingImageFiles.filter(
                                      (_, fileIndex) => fileIndex !== previewIndex,
                                    ),
                                    pendingImagePreviews: variant.pendingImagePreviews.filter(
                                      (_, fileIndex) => fileIndex !== previewIndex,
                                    ),
                                  });
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <label className="flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-gray-500 hover:bg-gray-50">
                            <Plus className="h-4 w-4" />
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(event) => {
                                const files = Array.from(event.target.files ?? []);
                                event.target.value = "";
                                if (files.length === 0) return;
                                updateProductVariantDraft(index, {
                                  pendingImageFiles: [...variant.pendingImageFiles, ...files],
                                  pendingImagePreviews: [
                                    ...variant.pendingImagePreviews,
                                    ...files.map((file) => URL.createObjectURL(file)),
                                  ],
                                });
                              }}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-gray-500">
                          Add one or more photos for a variant gallery.
                        </p>
                      </div>
                    </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setProductVariantDrafts((currentVariants) => [
                        ...currentVariants,
                        {
                          color: "",
                          images: [],
                          pendingImageFiles: [],
                          pendingImagePreviews: [],
                          inStock: true,
                          priceOverride: "",
                          size: "",
                          sku: "",
                          stockQuantity: "0",
                        },
                      ])
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Option
                  </Button>
                </div>
              ) : null}
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

            <Button type="submit" className="w-full" disabled={savingProduct}>
              {savingProduct
                ? "Saving..."
                : editingProduct ? "Update Product" : "Create Product"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDealModal} onOpenChange={setShowDealModal}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
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
                  {allProductOptions.map((product) => (
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

            <div className="space-y-4">
              <AdminDateTimeField
                id="deal-starts"
                label="Starts At"
                value={dealStartsAt}
                onChange={setDealStartsAt}
                defaultTime="09:00"
                description="Choose the start date in DD/MM/YYYY format and keep the exact time you want the deal to begin."
              />
              <AdminDateTimeField
                id="deal-ends"
                label="Ends At"
                value={dealEndsAt}
                onChange={setDealEndsAt}
                defaultTime="23:59"
                description="Choose the end date in DD/MM/YYYY format and keep the exact time you want the deal to stop."
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <AdminDateTimeField
                id="blog-published-at"
                label="Publish Date"
                value={blogPublishedAt}
                onChange={setBlogPublishedAt}
                defaultTime="09:00"
                description="Blog publish dates use DD/MM/YYYY format and keep the time you select."
              />
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
