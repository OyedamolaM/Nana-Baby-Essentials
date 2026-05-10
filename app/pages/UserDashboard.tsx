"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gift, Lock, MapPin, Package, Pencil, Share2, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { formatNairaAmount } from "../../lib/commerce";
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
import { RegistryCreateModal } from "../components/registry/RegistryCreateModal";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type UserOrder = {
  customer_pickup_code?: string | null;
  id: string;
  created_at: string;
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
  name: string;
  share_code: string;
  status?: string | null;
  due_month?: string | null;
  baby_gender?: string | null;
  created_at: string;
};

type DashboardCacheEntry = {
  campaignOptOut: boolean;
  fullName: string;
  hasRegistryData: boolean;
  orders: UserOrder[];
  phone: string;
  registries: RegistryRecord[];
  registryItemsByRegistry: Record<string, RegistryItem[]>;
  registryPaymentActivities: Record<string, RegistryPaymentActivity[]>;
  registrySummaries: Record<string, RegistrySummary>;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
};

const dashboardCache = new Map<string, DashboardCacheEntry>();
const DASHBOARD_CACHE_STORAGE_PREFIX = "nbe:dashboard:";

function getDashboardCacheStorageKey(userId: string) {
  return `${DASHBOARD_CACHE_STORAGE_PREFIX}${userId}`;
}

function readDashboardCacheEntry(userId: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const memoryEntry = dashboardCache.get(userId);
  if (memoryEntry) {
    return memoryEntry;
  }

  try {
    const rawValue = window.sessionStorage.getItem(getDashboardCacheStorageKey(userId));
    if (!rawValue) {
      return undefined;
    }

    const parsed = JSON.parse(rawValue) as DashboardCacheEntry;
    dashboardCache.set(userId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function persistDashboardCacheEntry(userId: string, entry: DashboardCacheEntry) {
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

type DashboardTab = "orders" | "registries" | "profile" | "address" | "security";

function getDashboardTabRoute(tab: DashboardTab) {
  switch (tab) {
    case "orders":
      return "/dashboard/orders";
    case "registries":
      return "/dashboard/registries";
    case "profile":
      return "/dashboard/profile";
    case "address":
      return "/dashboard/address";
    case "security":
      return "/dashboard/security";
    default:
      return "/dashboard/orders";
  }
}

export function UserDashboard({
  initialTab = "orders",
}: {
  initialTab?: DashboardTab;
}) {
  const router = useRouter();
  const { user, signOut, updateProfile, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const cachedEntry = useMemo(
    () => (userId ? readDashboardCacheEntry(userId) : undefined),
    [userId],
  );
  const [orders, setOrders] = useState<UserOrder[]>(cachedEntry?.orders ?? []);
  const [registries, setRegistries] = useState<RegistryRecord[]>(cachedEntry?.registries ?? []);
  const [registryItemsByRegistry, setRegistryItemsByRegistry] = useState<
    Record<string, RegistryItem[]>
  >(cachedEntry?.registryItemsByRegistry ?? {});
  const [registrySummaries, setRegistrySummaries] = useState<Record<string, RegistrySummary>>(
    cachedEntry?.registrySummaries ?? {},
  );
  const [registryPaymentActivities, setRegistryPaymentActivities] = useState<
    Record<string, RegistryPaymentActivity[]>
  >(cachedEntry?.registryPaymentActivities ?? {});
  const [loading, setLoading] = useState(Boolean(user && hasSupabaseEnv && !cachedEntry));

  const [fullName, setFullName] = useState(cachedEntry?.fullName ?? "");
  const [phone, setPhone] = useState(cachedEntry?.phone ?? "");
  const [campaignOptOut, setCampaignOptOut] = useState(cachedEntry?.campaignOptOut ?? false);

  const [shippingAddress, setShippingAddress] = useState(cachedEntry?.shippingAddress ?? "");
  const [shippingCity, setShippingCity] = useState(cachedEntry?.shippingCity ?? "");
  const [shippingState, setShippingState] = useState(cachedEntry?.shippingState ?? "");

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
  const loadRequestIdRef = useRef(0);
  const initialLoadKeyRef = useRef<string | null>(null);
  const registryItemsByRegistryRef = useRef(cachedEntry?.registryItemsByRegistry ?? {});
  const registrySummariesRef = useRef(cachedEntry?.registrySummaries ?? {});
  const registryPaymentActivitiesRef = useRef(
    cachedEntry?.registryPaymentActivities ?? {},
  );

  useEffect(() => {
    registryItemsByRegistryRef.current = registryItemsByRegistry;
  }, [registryItemsByRegistry]);

  useEffect(() => {
    registrySummariesRef.current = registrySummaries;
  }, [registrySummaries]);

  useEffect(() => {
    registryPaymentActivitiesRef.current = registryPaymentActivities;
  }, [registryPaymentActivities]);

  useEffect(() => {
    if (!cachedEntry) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setOrders(cachedEntry.orders);
      setRegistries(cachedEntry.registries);
      setRegistryItemsByRegistry(cachedEntry.registryItemsByRegistry);
      setRegistrySummaries(cachedEntry.registrySummaries);
      setRegistryPaymentActivities(cachedEntry.registryPaymentActivities);
      setFullName(cachedEntry.fullName);
      setPhone(cachedEntry.phone);
      setCampaignOptOut(cachedEntry.campaignOptOut);
      setShippingAddress(cachedEntry.shippingAddress);
      setShippingCity(cachedEntry.shippingCity);
      setShippingState(cachedEntry.shippingState);
      setLoading(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [cachedEntry]);

  const unfinishedOrders = useMemo(
    () => orders.filter((order) => order.status !== "paid"),
    [orders],
  );
  const paidOrders = useMemo(
    () => orders.filter((order) => order.status === "paid"),
    [orders],
  );
  const shouldLoadRegistryData = activeTab === "registries" || activeTab === "profile";
  const hasCurrentTabCache = Boolean(
    cachedEntry && (!shouldLoadRegistryData || cachedEntry.hasRegistryData),
  );
  const loadUserData = useCallback(async (showSpinner = false) => {
    if (!userId) {
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    if (showSpinner) {
      setLoading(true);
    }

    const [{ data: profileData }, { data: ordersData }, { data: registriesData }] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      shouldLoadRegistryData
        ? supabase
            .from("registries")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as RegistryRecord[] }),
    ]);

    if (loadRequestIdRef.current !== requestId) {
      return;
    }

    const typedProfile = (profileData as UserProfile | null) ?? null;

    if (typedProfile) {
      setFullName(typedProfile.full_name ?? "");
      setPhone(typedProfile.phone ?? "");
      setCampaignOptOut(Boolean(typedProfile.campaign_opt_out));
      if (typedProfile.shipping_address) {
        setShippingAddress(typedProfile.shipping_address.address ?? "");
        setShippingCity(typedProfile.shipping_address.city ?? "");
        setShippingState(typedProfile.shipping_address.state ?? "");
      }
    }

    const typedRegistries = (registriesData as RegistryRecord[] | null) ?? [];
    setOrders((ordersData as UserOrder[] | null) ?? []);
    setRegistries(typedRegistries);

    let registryItemsById: Record<string, RegistryItem[]> =
      registryItemsByRegistryRef.current;
    let registrySummaryMap: Record<string, RegistrySummary> =
      registrySummariesRef.current;
    let registryPaymentsMap: Record<string, RegistryPaymentActivity[]> =
      registryPaymentActivitiesRef.current;
    if (shouldLoadRegistryData && typedRegistries.length > 0) {
      const registryIds = typedRegistries.map((registry) => registry.id);
      const [
        { data: registryItemsData },
        { data: registryOrdersData },
        { data: registryContributionsData },
      ] = await Promise.all([
        supabase
          .from("registry_items")
          .select("*, products(*)")
          .in("registry_id", registryIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("registry_orders")
          .select("*")
          .in("registry_id", registryIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("registry_contributions")
          .select("*")
          .in("registry_id", registryIds)
          .order("created_at", { ascending: false }),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      const registryItems = ((registryItemsData as RegistryItemRecord[] | null) ?? []).map(
        mapRegistryItemRecord,
      );
      registryItemsById = registryItems.reduce<Record<string, RegistryItem[]>>(
        (accumulator, item) => {
          const existing = accumulator[item.registryId] ?? [];
          existing.push(item);
          accumulator[item.registryId] = existing;
          return accumulator;
        },
        {},
      );

      registrySummaryMap = Object.fromEntries(
        Object.entries(registryItemsById).map(([registryId, items]) => [
          registryId,
          summarizeRegistryItems(items),
        ]),
      ) as Record<string, RegistrySummary>;

      const registryOrders = (registryOrdersData as RegistryOrderRecord[] | null) ?? [];
      const registryContributions =
        (registryContributionsData as RegistryContributionRecord[] | null) ?? [];
      let registryOrderItems: RegistryOrderItemRecord[] = [];

      if (registryOrders.length > 0) {
        const { data: registryOrderItemsData } = await supabase
          .from("registry_order_items")
          .select("*")
          .in(
            "registry_order_id",
            registryOrders.map((registryOrder) => registryOrder.id),
          );
        registryOrderItems =
          (registryOrderItemsData as RegistryOrderItemRecord[] | null) ?? [];
      }

      registryPaymentsMap = typedRegistries.reduce<Record<string, RegistryPaymentActivity[]>>(
        (accumulator, registry) => {
          accumulator[registry.id] = buildRegistryPaymentActivities({
            contributions: registryContributions.filter(
              (contribution) => contribution.registry_id === registry.id,
            ),
            orderItems: registryOrderItems.filter((orderItem) =>
              registryOrders.some(
                (registryOrder) =>
                  registryOrder.id === orderItem.registry_order_id &&
                  registryOrder.registry_id === registry.id,
              ),
            ),
            orders: registryOrders.filter(
              (registryOrder) => registryOrder.registry_id === registry.id,
            ),
            registryItems: registryItemsById[registry.id] ?? [],
          });
          return accumulator;
        },
        {},
      );
    }

    setRegistryItemsByRegistry(registryItemsById);
    setRegistrySummaries(registrySummaryMap);
    setRegistryPaymentActivities(registryPaymentsMap);
    persistDashboardCacheEntry(userId, {
      campaignOptOut: Boolean(typedProfile?.campaign_opt_out),
      fullName: typedProfile?.full_name ?? "",
      hasRegistryData: shouldLoadRegistryData,
      orders: (ordersData as UserOrder[] | null) ?? [],
      phone: typedProfile?.phone ?? "",
      registries: typedRegistries,
      registryItemsByRegistry: registryItemsById,
      registryPaymentActivities: registryPaymentsMap,
      registrySummaries: registrySummaryMap,
      shippingAddress: typedProfile?.shipping_address?.address ?? "",
      shippingCity: typedProfile?.shipping_address?.city ?? "",
      shippingState: typedProfile?.shipping_address?.state ?? "",
    });
    setLoading(false);
  }, [shouldLoadRegistryData, userId]);

  useEffect(() => {
    if (!userId || !hasSupabaseEnv) {
      return;
    }

    const isInitialDashboardLoad = initialLoadKeyRef.current === null;
    const requestKey = `${userId}:${activeTab}`;
    if (initialLoadKeyRef.current === requestKey) {
      return;
    }

    initialLoadKeyRef.current = requestKey;

    if (hasCurrentTabCache) {
      const frameId = window.requestAnimationFrame(() => {
        setLoading(false);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    queueMicrotask(() => {
      void loadUserData(isInitialDashboardLoad && !cachedEntry);
    });
  }, [activeTab, cachedEntry, hasCurrentTabCache, loadUserData, userId]);

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
    await loadUserData();
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
      toast.error("Failed to update address.");
    } else {
      toast.success("Address updated successfully.");
      await loadUserData();
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
    await loadUserData();
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
    await loadUserData();
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
    await loadUserData();
  };

  const renderOrders = (items: UserOrder[], emptyMessage: string) => {
    if (items.length === 0) {
      return <p className="text-gray-500">{emptyMessage}</p>;
    }

    return (
      <div className="space-y-4">
        {items.map((order) => (
          <div key={order.id} className="rounded-lg border p-4">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="font-semibold">Order #{order.id.substring(0, 8)}</p>
                <p className="text-sm text-gray-500">
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
                {order.shipping_tier ? (
                  <p className="text-xs text-gray-500">{order.shipping_tier}</p>
                ) : null}
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
            {order.customer_pickup_code || order.rider_pickup_code ? (
              <>
                <Separator className="my-2" />
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                  {order.customer_pickup_code ? (
                    <p>Customer pickup code: {order.customer_pickup_code}</p>
                  ) : null}
                  {order.rider_pickup_code ? (
                    <p>Rider pickup code: {order.rider_pickup_code}</p>
                  ) : null}
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
          </div>
        ))}
      </div>
    );
  };

  const handleTabChange = (nextTab: string) => {
    const normalizedTab = nextTab as DashboardTab;
    setActiveTab(normalizedTab);

    if (typeof window !== "undefined") {
      const nextRoute = getDashboardTabRoute(normalizedTab);
      if (window.location.pathname !== nextRoute) {
        window.history.replaceState(window.history.state, "", nextRoute);
      }
    }
  };

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
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="mb-6 space-y-4">
            <h1 className="text-3xl font-bold">My Dashboard</h1>
            <TabsList className="flex h-14 w-full items-center justify-start gap-2 overflow-x-auto px-2 no-scrollbar sm:h-auto sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
            <TabsTrigger
              value="orders"
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-3 text-sm h-10"
            >
              <Package className="h-4 w-4" />
              Orders
            </TabsTrigger>
            <TabsTrigger 
              value="registries"
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-3 text-sm h-10"
            >
              <Gift className="h-4 w-4" />
              Registries
            </TabsTrigger>
            <TabsTrigger 
              value="profile"
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-3 text-sm h-10"
            >
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger 
              value="address"
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-3 text-sm h-10"
            >
              <MapPin className="h-4 w-4" />
              Address
            </TabsTrigger>
            <TabsTrigger 
              value="security"
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-3 text-sm h-10"
            >
              <Lock className="h-4 w-4" />
              Security
            </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-[55vh]">
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Order History</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs
                  defaultValue={paidOrders.length > 0 ? "paid" : "unfinished"}
                  className="space-y-4"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="paid" className="min-w-0 whitespace-normal px-3 py-2 text-center leading-tight">
                      Paid Orders ({paidOrders.length})
                    </TabsTrigger>
                    <TabsTrigger value="unfinished" className="min-w-0 whitespace-normal px-3 py-2 text-center leading-tight">
                      Unfinished ({unfinishedOrders.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="unfinished">
                    {renderOrders(
                      unfinishedOrders,
                      "No unfinished orders right now.",
                    )}
                  </TabsContent>

                  <TabsContent value="paid">
                    {renderOrders(paidOrders, "No paid orders yet.")}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registries">
            <Card>
              <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>My Registries</CardTitle>
                  <p className="mt-1 text-sm text-gray-500">
                    Open each registry detail page to review funded items and payment history.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                  <Button asChild variant="outline">
                    <Link href="/registry/products">Browse Registry Catalog</Link>
                  </Button>
                  <Button onClick={() => setRegistryCreateOpen(true)}>
                    <Gift className="mr-2 h-4 w-4" />
                    Create New Registry
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {registries.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="mb-4 text-gray-500">No registries yet.</p>
                    <Button onClick={() => setRegistryCreateOpen(true)}>Create Your First Registry</Button>
                  </div>
                ) : (
                  <div className="space-y-4">
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

                      return (
                        <div key={registry.id} className="rounded-lg border p-4">
                          <div className="mb-2 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                              <p className="text-lg font-semibold">
                                {registry.name}
                              </p>
                              <p className="text-sm text-gray-500">
                                Due: {formatDueMonth(registry.due_month)} and
                                gender: {formatBabyGender(registry.baby_gender)}
                              </p>
                              <p className="text-sm text-gray-500">
                                Created:{" "}
                                {new Date(registry.created_at).toLocaleDateString()}
                              </p>
                              {registry.status === "closed" ? (
                                <p className="mt-2 inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-700">
                                  Closed
                                </p>
                              ) : null}
                              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                                <div className="rounded-xl bg-gray-50 px-3 py-2">
                                  <span className="font-semibold text-gray-900">
                                    Requested:
                                  </span>{" "}
                                  {summary.requested}
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-2">
                                  <span className="font-semibold text-gray-900">
                                    Gifted:
                                  </span>{" "}
                                  {summary.purchased}
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-2">
                                  <span className="font-semibold text-gray-900">
                                    Remaining:
                                  </span>{" "}
                                  {summary.remainingQuantity}
                                </div>
                              </div>
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleShareRegistry(registry)}
                              >
                                <Share2 className="mr-2 h-4 w-4" />
                                Share
                              </Button>
                              <Button asChild size="sm">
                                <Link href={buildRegistryDashboardPath(registry)}>
                                  Open Registry
                                </Link>
                              </Button>
                            </div>
                          </div>
                          <Separator className="my-2" />
                          <div className="rounded bg-gray-50 p-3">
                            <p className="text-sm font-medium text-gray-700">
                              Registry Code:
                            </p>
                            <p className="font-mono text-lg font-bold text-pink-600">
                              {registry.share_code}
                            </p>
                          </div>
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
                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm">
                                  <span className="font-semibold text-gray-900">
                                    Needed:
                                  </span>{" "}
                                  {formatNairaAmount(summary.totalNeededAmount)}
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm">
                                  <span className="font-semibold text-gray-900">
                                    Funded:
                                  </span>{" "}
                                  {formatNairaAmount(summary.fundedAmount)}
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm">
                                  <span className="font-semibold text-gray-900">
                                    Left:
                                  </span>{" "}
                                  {formatNairaAmount(summary.remainingAmount)}
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

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={buildRegistryDashboardPath(registry)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Manage Registry
                              </Link>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile">
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Profile</CardTitle>
                    <p className="mt-1 text-sm text-gray-500">
                      Review your personal details before editing them.
                    </p>
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

              <Card>
                <CardHeader>
                  <CardTitle>Registry Controls</CardTitle>
                  <p className="mt-1 text-sm text-gray-500">
                    Close a registry when you are done with it. The history stays available.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {registries.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      You do not have any registries yet.
                    </p>
                  ) : (
                    registries.map((registry) => (
                      <div key={registry.id} className="rounded-xl border px-4 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900">{registry.name}</p>
                            <p className="text-sm text-gray-500">
                              Code: {registry.share_code}
                            </p>
                            {registry.closed_note ? (
                              <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                Closing note: {registry.closed_note}
                              </p>
                            ) : null}
                          </div>
                          {registry.status === "closed" ? (
                            <Button
                              variant="outline"
                              onClick={() => void handleReopenRegistry(registry)}
                              disabled={savingRegistryStatus}
                            >
                              Reopen Registry
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => handleOpenCloseRegistry(registry)}
                              disabled={savingRegistryStatus}
                            >
                              Close Registry
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
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

          <TabsContent value="security">
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Campaign Emails</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Customer campaigns are different from newsletters. You can opt out here, or use the unsubscribe link at the bottom of any campaign email.
                </p>
                <div className="flex flex-col gap-3 rounded-xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {campaignOptOut ? "Campaign emails turned off" : "Campaign emails turned on"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {campaignOptOut
                        ? "You will stop receiving promotional customer campaigns until you turn them back on."
                        : "You can still receive order emails. This only controls promotional customer campaigns."}
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

            <Card className="mb-4">
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
          </div>
        </Tabs>
      </div>

      <RegistryCreateModal
        open={registryCreateOpen}
        onOpenChange={setRegistryCreateOpen}
        onCreated={(registry) => {
          void loadUserData();
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
