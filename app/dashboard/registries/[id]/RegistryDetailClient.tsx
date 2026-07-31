"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Gift, Pencil, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  formatNairaAmount,
  PRODUCT_LIST_SELECT,
  toNairaAmount,
} from "../../../../lib/commerce";
import { REGISTRY_CHECKLIST_DOWNLOAD_PATH } from "../../../../lib/registryLandingContent";
import {
  clearRegistryCart,
  readRegistryCart,
  removeRegistryCartItem,
  updateRegistryCartQuantity,
  type RegistryCartItem,
} from "../../../../lib/registryCart";
import {
  buildRegistryPaymentActivities,
  formatBabyGender,
  formatDueMonth,
  getRegistryItemFundedAmount,
  getRegistryItemRemainingAmount,
  getRemainingRegistryQuantity,
  mapRegistryItemRecord,
  resolveRegistryDashboardLookup,
  summarizeRegistryItems,
  type RegistryContributionRecord,
  type RegistryItem,
  type RegistryItemRecord,
  type RegistryOrderItemRecord,
  type RegistryOrderRecord,
  type RegistryPaymentActivity,
  type RegistryRecord,
} from "../../../../lib/registry";
import { AuthModal } from "../../../components/auth/AuthModal";
import { RegistryCartModal } from "../../../components/registry/RegistryCartModal";
import { RegistryCreateModal } from "../../../components/registry/RegistryCreateModal";
import { RegistryHeader } from "../../../components/registry/RegistryHeader";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Separator } from "../../../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Textarea } from "../../../components/ui/textarea";
import { useAuth } from "../../../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../../../lib/supabase";

type AuthTab = "login" | "signup";

type RegistryDetailCacheEntry = {
  payments: RegistryPaymentActivity[];
  registries: RegistryRecord[];
  registry: RegistryRecord | null;
  registryItems: RegistryItem[];
};

const registryDetailCache = new Map<string, RegistryDetailCacheEntry>();
const REGISTRY_DETAIL_CACHE_STORAGE_PREFIX = "nbe:registry-detail:";

function getRegistryDetailCacheStorageKey(registryId: string) {
  return `${REGISTRY_DETAIL_CACHE_STORAGE_PREFIX}${registryId}`;
}

function readRegistryDetailCacheEntry(registryId: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const memoryEntry = registryDetailCache.get(registryId);
  if (memoryEntry) {
    return memoryEntry;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      getRegistryDetailCacheStorageKey(registryId),
    );
    if (!rawValue) {
      return undefined;
    }

    const parsed = JSON.parse(rawValue) as RegistryDetailCacheEntry;
    registryDetailCache.set(registryId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function persistRegistryDetailCacheEntry(
  registryId: string,
  entry: RegistryDetailCacheEntry,
) {
  registryDetailCache.set(registryId, entry);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getRegistryDetailCacheStorageKey(registryId),
      JSON.stringify(entry),
    );
  } catch {
    // Ignore storage failures and keep the in-memory cache.
  }
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

export function RegistryDetailClient({ registryId }: { registryId: string }) {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, signOut } = useAuth();
  const userId = user?.id ?? null;
  const cachedEntry = useMemo(
    () => readRegistryDetailCacheEntry(registryId),
    [registryId],
  );
  const initialRegistryLoadKeyRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(Boolean(user && hasSupabaseEnv && !cachedEntry));
  const [registry, setRegistry] = useState<RegistryRecord | null>(cachedEntry?.registry ?? null);
  const [registryItems, setRegistryItems] = useState<RegistryItem[]>(cachedEntry?.registryItems ?? []);
  const [payments, setPayments] = useState<RegistryPaymentActivity[]>(cachedEntry?.payments ?? []);
  const [userRegistries, setUserRegistries] = useState<RegistryRecord[]>(cachedEntry?.registries ?? []);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState<AuthTab>("login");
  const [registryCartOpen, setRegistryCartOpen] = useState(false);
  const [registryCreateOpen, setRegistryCreateOpen] = useState(false);
  const [registryCartItems, setRegistryCartItems] = useState<RegistryCartItem[]>([]);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegistryItem | null>(null);
  const [editRequestedQuantity, setEditRequestedQuantity] = useState("1");
  const [editNote, setEditNote] = useState("");
  const [savingItem, setSavingItem] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setRegistryCartItems(readRegistryCart());
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const loadRegistry = useCallback(async (showSpinner = false) => {
    if (!userId || !hasSupabaseEnv) {
      return;
    }

    if (showSpinner) {
      setLoading(true);
    }

    const lookup = resolveRegistryDashboardLookup(registryId);
    const registryLookupQuery = supabase
      .from("registries")
      .select("*")
      .eq("user_id", userId);

    const [{ data: registriesData }, { data: registryData }] = await Promise.all([
      supabase
        .from("registries")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      lookup.field === "id"
        ? registryLookupQuery.eq("id", lookup.value).maybeSingle()
        : registryLookupQuery.eq("share_code", lookup.value).maybeSingle(),
    ]);

    const typedUserRegistries = (registriesData as RegistryRecord[] | null) ?? [];
    const typedRegistry = (registryData as RegistryRecord | null) ?? null;

    setUserRegistries(typedUserRegistries);
    setRegistry(typedRegistry);

    if (!typedRegistry) {
      setRegistryItems([]);
      setPayments([]);
      persistRegistryDetailCacheEntry(registryId, {
        payments: [],
        registries: typedUserRegistries,
        registry: null,
        registryItems: [],
      });
      setLoading(false);
      return;
    }

    const [{ data: itemRows }, { data: orderRows }, { data: contributionRows }] =
      await Promise.all([
        supabase
          .from("registry_items")
          .select(`*, products(${PRODUCT_LIST_SELECT})`)
          .eq("registry_id", typedRegistry.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("registry_orders")
          .select("*")
          .eq("registry_id", typedRegistry.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("registry_contributions")
          .select("*")
          .eq("registry_id", typedRegistry.id)
          .order("created_at", { ascending: false }),
      ]);

    const items = ((itemRows as RegistryItemRecord[] | null) ?? []).map(
      mapRegistryItemRecord,
    );
    const orders = (orderRows as RegistryOrderRecord[] | null) ?? [];
    const contributions =
      (contributionRows as RegistryContributionRecord[] | null) ?? [];
    let orderItems: RegistryOrderItemRecord[] = [];

    if (orders.length > 0) {
      const { data: registryOrderItemsData } = await supabase
        .from("registry_order_items")
        .select("*")
        .in(
          "registry_order_id",
          orders.map((order) => order.id),
        );

      orderItems =
        (registryOrderItemsData as RegistryOrderItemRecord[] | null) ?? [];
    }

    const nextPayments = buildRegistryPaymentActivities({
      contributions,
      orderItems,
      orders,
      registryItems: items,
    });

    setRegistryItems(items);
    setPayments(nextPayments);
    persistRegistryDetailCacheEntry(registryId, {
      payments: nextPayments,
      registries: typedUserRegistries,
      registry: typedRegistry,
      registryItems: items,
    });
    setLoading(false);
  }, [registryId, userId]);

  useEffect(() => {
    if (!userId || !hasSupabaseEnv) {
      return;
    }

    const requestKey = `${userId}:${registryId}`;
    if (initialRegistryLoadKeyRef.current === requestKey) {
      return;
    }

    initialRegistryLoadKeyRef.current = requestKey;

    if (cachedEntry) {
      const frameId = window.requestAnimationFrame(() => {
        setLoading(false);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    queueMicrotask(() => {
      void loadRegistry(true);
    });
  }, [cachedEntry, loadRegistry, registryId, userId]);

  useEffect(() => {
    if (!cachedEntry) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setRegistry(cachedEntry.registry);
      setRegistryItems(cachedEntry.registryItems);
      setPayments(cachedEntry.payments);
      setUserRegistries(cachedEntry.registries);
      setLoading(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [cachedEntry]);

  const summary = useMemo(() => summarizeRegistryItems(registryItems), [registryItems]);
  const registryIsClosed = registry?.status === "closed";
  const minimumEditableQuantity = useMemo(() => {
    if (!editingItem) {
      return 1;
    }

    const unitAmount = Math.max(1, toNairaAmount(editingItem.unitPriceSnapshot));
    const fundedAmount = getRegistryItemFundedAmount(editingItem);

    return Math.max(
      editingItem.purchasedQuantity,
      fundedAmount > 0 ? Math.ceil(fundedAmount / unitAmount) : 0,
      1,
    );
  }, [editingItem]);
  const activeRegistries = useMemo(() => {
    return userRegistries.filter((entry) => entry.status !== "closed");
  }, [userRegistries]);
  const currentRegistrySummary = registry ? [{ id: registry.id, name: registry.name }] : [];

  const openAuth = (tab: AuthTab) => {
    setAuthDefaultTab(tab);
    setAuthModalOpen(true);
  };

  const handleOpenDashboard = () => {
    if (!user) {
      openAuth("login");
      return;
    }

    router.push("/dashboard");
  };

  const handleOpenAdmin = () => {
    if (!user) {
      openAuth("login");
      return;
    }

    if (!isAdmin) {
      toast.error("Admin access is not enabled for this account.");
      return;
    }

    router.push("/admin");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out.");
    router.push("/");
  };

  const handleShareRegistry = async () => {
    if (!registry || typeof window === "undefined") {
      return;
    }

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
        // Fall through to clipboard.
      }
    }

    await navigator.clipboard.writeText(shareUrl);
    toast.success("Registry link copied to clipboard.");
  };

  const handleDownloadChecklist = () => {
    if (typeof window === "undefined" || !registry) {
      return;
    }

    const link = document.createElement("a");
    link.href = REGISTRY_CHECKLIST_DOWNLOAD_PATH;
    link.download = `${registry.share_code.toLowerCase()}-checklist.txt`;
    link.click();
  };

  const handleOpenEditItem = (item: RegistryItem) => {
    setEditingItem(item);
    setEditRequestedQuantity(String(item.requestedQuantity));
    setEditNote(item.note);
    setEditItemOpen(true);
  };

  const handleSaveItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingItem) {
      return;
    }

    const unitAmount = Math.max(1, toNairaAmount(editingItem.unitPriceSnapshot));
    const fundedAmount = getRegistryItemFundedAmount(editingItem);
    const minimumLockedQuantity = Math.max(
      editingItem.purchasedQuantity,
      fundedAmount > 0 ? Math.ceil(fundedAmount / unitAmount) : 0,
    );
    const nextRequestedQuantity = Math.max(1, Math.floor(Number(editRequestedQuantity)));

    if (nextRequestedQuantity < minimumLockedQuantity) {
      toast.error(
        minimumLockedQuantity === editingItem.purchasedQuantity
          ? "You cannot reduce this item below the number already covered by gifts."
          : "You cannot reduce this item below the quantity already paid toward.",
      );
      return;
    }

    setSavingItem(true);

    const { error } = await supabase
      .from("registry_items")
      .update({
        requested_quantity: nextRequestedQuantity,
        note: editNote.trim(),
      })
      .eq("id", editingItem.id);

    setSavingItem(false);

    if (error) {
      toast.error("Could not update this registry item.");
      return;
    }

    toast.success("Registry item updated.");
    setEditItemOpen(false);
    setEditingItem(null);
    await loadRegistry();
  };

  const handleRemoveItem = async (item: RegistryItem) => {
    if (item.purchasedQuantity > 0 || getRegistryItemFundedAmount(item) > 0) {
      toast.error("This item already has gift activity, so it cannot be removed.");
      return;
    }

    if (!window.confirm(`Remove ${item.product?.name ?? "this item"} from your registry?`)) {
      return;
    }

    const { error } = await supabase
      .from("registry_items")
      .delete()
      .eq("id", item.id);

    if (error) {
      toast.error("Could not remove this registry item.");
      return;
    }

    toast.success("Registry item removed.");
    await loadRegistry();
  };

  const handleAddRegistryCartToExisting = async (targetRegistryId: string) => {
    if (!user) {
      openAuth("login");
      return;
    }

    if (!targetRegistryId) {
      toast.error("Select a registry first.");
      return;
    }

    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    const targetRegistry = activeRegistries.find((entry) => entry.id === targetRegistryId);
    if (!targetRegistry) {
      toast.error("This registry is no longer available for new items.");
      return;
    }

    const productIds = registryCartItems.map((item) => item.product.id);
    if (productIds.length === 0) {
      toast.info("Your registry cart is empty.");
      return;
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("registry_items")
      .select("id, product_id, requested_quantity, purchased_quantity, unit_price_snapshot")
      .eq("registry_id", targetRegistryId)
      .in("product_id", productIds);

    if (existingError) {
      toast.error("Could not load the existing registry items.");
      return;
    }

    type ExistingRegistryItem = {
      id: string;
      product_id: number;
      purchased_quantity?: number | null;
      requested_quantity?: number | null;
      unit_price_snapshot?: number | null;
    };
    const existingByProductId = ((existingRows as ExistingRegistryItem[] | null) ?? []).reduce<
      Map<number, ExistingRegistryItem[]>
    >((itemsByProduct, row) => {
      const productId = Number(row.product_id);
      itemsByProduct.set(productId, [...(itemsByProduct.get(productId) ?? []), row]);
      return itemsByProduct;
    }, new Map());

    for (const item of registryCartItems) {
      const existingItem = existingByProductId
        .get(item.product.id)
        ?.find(
          (row) =>
            Math.abs(Number(row.unit_price_snapshot ?? 0) - item.product.price) < 0.0001,
        );

      if (existingItem) {
        const { error } = await supabase
          .from("registry_items")
          .update({
            requested_quantity: Number(existingItem.requested_quantity ?? 0) + item.quantity,
          })
          .eq("id", existingItem.id);

        if (error) {
          toast.error(`Could not update ${item.product.name} in your registry.`);
          return;
        }
      } else {
        const { error } = await supabase.from("registry_items").insert({
          registry_id: targetRegistryId,
          product_id: item.product.id,
          requested_quantity: item.quantity,
          purchased_quantity: 0,
          funded_amount: 0,
          unit_price_snapshot: item.product.price,
          note: "",
        });

        if (error) {
          toast.error(`Could not add ${item.product.name} to your registry.`);
          return;
        }
      }
    }

    clearRegistryCart();
    setRegistryCartItems([]);
    setRegistryCartOpen(false);
    toast.success("Registry items added successfully.");
    await loadRegistry();
  };

  const handleRemoveRegistryCartItem = (productId: number) => {
    setRegistryCartItems(removeRegistryCartItem(productId));
  };

  const handleUpdateRegistryCartItem = (productId: number, quantity: number) => {
    setRegistryCartItems(updateRegistryCartQuantity(productId, quantity));
  };

  const handleCreateNewRegistry = () => {
    if (!user) {
      openAuth("signup");
      return;
    }

    setRegistryCreateOpen(true);
  };

  if (authLoading) {
    return <div className="container mx-auto px-4 py-10">Loading registry...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white">
        <RegistryHeader
          cartItemCount={registryCartItems.length}
          isAuthenticated={false}
          isAdmin={isAdmin}
          onCartClick={() => setRegistryCartOpen(true)}
          onOpenAdmin={handleOpenAdmin}
          onOpenDashboard={handleOpenDashboard}
          onSignIn={() => openAuth("login")}
          onSignOut={handleSignOut}
          onSignUp={() => openAuth("signup")}
        />
        <div className="container mx-auto px-4 py-10">
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600">
              Sign in to view your registry details.
            </CardContent>
          </Card>
        </div>

        <AuthModal
          open={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          defaultTab={authDefaultTab}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <RegistryHeader
        cartItemCount={registryCartItems.length}
        isAuthenticated
        isAdmin={isAdmin}
        onCartClick={() => setRegistryCartOpen(true)}
        onOpenAdmin={handleOpenAdmin}
        onOpenDashboard={handleOpenDashboard}
        onSignIn={() => openAuth("login")}
        onSignOut={handleSignOut}
        onSignUp={() => openAuth("signup")}
      />

      <div className="container mx-auto px-4 py-10">
        {loading ? (
          <div>Loading registry...</div>
        ) : !registry ? (
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle>Registry not found</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-600">
              <p>This registry does not belong to your account or may have been removed.</p>
              <Button asChild>
                <Link href="/dashboard/registries">Back to My Registries</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex flex-col gap-4 rounded-[32px] border bg-white p-5 shadow-sm sm:p-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pink-500">
                  {registryIsClosed ? "Closed Registry" : "My Registry"}
                </p>
                <h1 className="text-3xl font-bold text-gray-900">{registry.name}</h1>
                <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                  <span>Code: {registry.share_code}</span>
                  <span>Due: {formatDueMonth(registry.due_month)}</span>
                  <span>Baby: {formatBabyGender(registry.baby_gender)}</span>
                </div>
              </div>

              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:w-auto md:flex md:flex-nowrap md:justify-end">
                <Button
                  variant="outline"
                  className="w-full min-w-0 px-3 text-sm md:w-auto md:px-4"
                  onClick={handleShareRegistry}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share Registry
                </Button>
                <Button
                  variant="outline"
                  className="w-full min-w-0 px-3 text-sm md:w-auto md:px-4"
                  onClick={() => router.push("/registry/products")}
                >
                  <Gift className="mr-2 h-4 w-4" />
                  Add Registry Items
                </Button>
                <Button
                  variant="outline"
                  className="w-full min-w-0 px-3 text-sm sm:col-span-2 md:col-span-1 md:w-auto md:px-4"
                  onClick={handleDownloadChecklist}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Checklist
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 sm:tracking-[0.18em]">Requested</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{summary.requested}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 sm:tracking-[0.18em]">Covered</p>
                  <p className="mt-2 text-3xl font-bold text-green-600">{summary.purchased}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 sm:tracking-[0.18em]">Still Needed</p>
                  <p className="mt-2 text-3xl font-bold text-pink-600">{summary.remainingQuantity}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="min-w-0 p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 sm:tracking-[0.18em]">Amount Left</p>
                  <p className="mt-2 text-2xl font-bold text-purple-600 sm:text-3xl">
                    {formatNairaAmount(summary.remainingAmount)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="items" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="items" className="cursor-pointer">
                  Item Funding
                </TabsTrigger>
                <TabsTrigger value="payments" className="cursor-pointer">
                  Payment Activity
                </TabsTrigger>
              </TabsList>

              <TabsContent value="items">
                <Card>
                  <CardHeader>
                    <CardTitle>Item Funding</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {registryItems.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No items have been added yet. Browse the registry catalog to start building.
                      </p>
                    ) : (
                      registryItems.map((item) => (
                        <div key={item.id} className="rounded-2xl border p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <p className="text-lg font-semibold text-gray-900">
                                {item.product?.name ?? "Registry item"}
                              </p>
                              <p className="text-sm text-gray-500">
                                Requested {item.requestedQuantity}, covered {item.purchasedQuantity},
                                remaining {getRemainingRegistryQuantity(item)}
                              </p>
                              {item.note ? (
                                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                  {item.note}
                                </p>
                              ) : null}
                            </div>
                            <div className="space-y-3 text-sm text-gray-600 md:text-right">
                              <p>Funded: {formatNairaAmount(getRegistryItemFundedAmount(item))}</p>
                              <p>Left: {formatNairaAmount(getRegistryItemRemainingAmount(item))}</p>
                              <div className="flex flex-wrap gap-2 md:justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenEditItem(item)}
                                  disabled={registryIsClosed}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleRemoveItem(item)}
                                  disabled={registryIsClosed}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payments">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {payments.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No completed payments have been recorded for this registry yet.
                      </p>
                    ) : (
                      payments.map((payment) => (
                        <div key={payment.id} className="rounded-2xl border p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-lg font-semibold text-gray-900">{payment.buyerName}</p>
                              <p className="text-sm text-gray-500">
                                {payment.buyerEmail}
                                {payment.buyerPhone ? ` | ${payment.buyerPhone}` : ""}
                              </p>
                              <div className="mt-3 space-y-1 text-sm text-gray-600">
                                {payment.itemLabels.map((label) => (
                                  <p key={`${payment.id}-${label}`}>{label}</p>
                                ))}
                              </div>
                              {payment.buyerMessage ? (
                                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                  &quot;{payment.buyerMessage}&quot;
                                </p>
                              ) : null}
                            </div>
                            <div className="text-sm text-gray-600 md:text-right">
                              <p className="text-lg font-semibold text-gray-900">
                                {formatNairaAmount(payment.totalAmount)}
                              </p>
                              <p>{payment.type === "item" ? "Registry item gift" : "Cash gift"}</p>
                              <p>{formatDateTime(payment.paidAt ?? payment.createdAt)}</p>
                              {payment.paystackReference ? (
                                <p className="font-mono text-xs text-gray-500">
                                  {payment.paystackReference}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <Separator className="mt-4" />
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      <RegistryCartModal
        open={registryCartOpen}
        onOpenChange={setRegistryCartOpen}
        onClose={() => setRegistryCartOpen(false)}
        isAuthenticated={Boolean(user)}
        items={registryCartItems}
        registries={
          registry && registry.status !== "closed"
            ? currentRegistrySummary
            : activeRegistries.map((entry) => ({ id: entry.id, name: entry.name }))
        }
        onRequireAuth={() => openAuth("signup")}
        onCreateNew={handleCreateNewRegistry}
        onAddToExisting={handleAddRegistryCartToExisting}
        onRemoveItem={handleRemoveRegistryCartItem}
        onUpdateQuantity={handleUpdateRegistryCartItem}
      />

      <RegistryCreateModal
        open={registryCreateOpen}
        onOpenChange={setRegistryCreateOpen}
        onCreated={async (registry) => {
          setRegistryCartItems(readRegistryCart());
          await loadRegistry();
          router.push(registry.dashboardPath);
        }}
      />

      <Dialog open={editItemOpen} onOpenChange={setEditItemOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Registry Item</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveItem} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="requested-quantity">Requested Quantity</Label>
              <Input
                id="requested-quantity"
                type="number"
                min={minimumEditableQuantity}
                value={editRequestedQuantity}
                onChange={(event) => setEditRequestedQuantity(event.target.value)}
                required
              />
            </div>

            {editingItem && minimumEditableQuantity > 1 ? (
              <p className="text-sm text-gray-500">
                This quantity cannot go below {minimumEditableQuantity} because gifts or
                payments have already been recorded for it.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="registry-item-note">Note</Label>
              <Textarea
                id="registry-item-note"
                rows={4}
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={savingItem}>
              {savingItem ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab={authDefaultTab}
      />
    </div>
  );
}
