"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Baby,
  CalendarClock,
  Gift,
  Minus,
  Plus,
  Share2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Footer } from "../../components/Footer";
import { ImageWithFallback } from "../../components/figma/ImageWithFallback";
import {
  RegistryGiftCheckoutModal,
  type RegistryGiftSelection,
} from "../../components/registry/RegistryGiftCheckoutModal";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { formatNairaAmount, toNairaAmount } from "../../../lib/commerce";
import {
  formatBabyGender,
  formatDueMonth,
  getRegistryItemFundedAmount,
  getRegistryItemRemainingAmount,
  getRegistryItemSelectionAmount,
  getRemainingRegistryQuantity,
  mapRegistryItemRecord,
  type RegistryItem,
  type RegistryItemRecord,
  type RegistryRecord,
} from "../../../lib/registry";
import { type ShippingAddress } from "../../../lib/userProfile";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";

interface PublicRegistryPageClientProps {
  initialItems: RegistryItem[];
  initialRegistry: RegistryRecord | null;
  initialShippingAddress: ShippingAddress | null;
  shareCode: string;
}

type PublicRegistryCacheEntry = {
  items: RegistryItem[];
  registry: RegistryRecord | null;
  shippingAddress: ShippingAddress | null;
};

const PUBLIC_REGISTRY_CACHE_STORAGE_PREFIX = "nbe:public-registry:";
const publicRegistryCache = new Map<string, PublicRegistryCacheEntry>();

function getPublicRegistryCacheKey(shareCode: string) {
  return `${PUBLIC_REGISTRY_CACHE_STORAGE_PREFIX}${shareCode.toUpperCase()}`;
}

function readPublicRegistryCache(shareCode: string) {
  const cacheKey = getPublicRegistryCacheKey(shareCode);

  if (typeof window === "undefined") {
    return undefined;
  }

  const memoryEntry = publicRegistryCache.get(cacheKey);
  if (memoryEntry) {
    return memoryEntry;
  }

  try {
    const rawValue = window.sessionStorage.getItem(cacheKey);
    if (!rawValue) {
      return undefined;
    }

    const parsed = JSON.parse(rawValue) as PublicRegistryCacheEntry;
    publicRegistryCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function persistPublicRegistryCache(
  shareCode: string,
  entry: PublicRegistryCacheEntry,
) {
  const cacheKey = getPublicRegistryCacheKey(shareCode);
  publicRegistryCache.set(cacheKey, entry);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch {
    // Ignore storage failures and keep the in-memory cache.
  }
}

export function PublicRegistryPageClient({
  initialItems,
  initialRegistry,
  initialShippingAddress,
  shareCode,
}: PublicRegistryPageClientProps) {
  const [loading, setLoading] = useState(() =>
    Boolean(!initialRegistry && shareCode && hasSupabaseEnv),
  );
  const [registry, setRegistry] = useState<RegistryRecord | null>(initialRegistry);
  const [registryItems, setRegistryItems] = useState<RegistryItem[]>(initialItems);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(
    initialShippingAddress,
  );
  const skipInitialLoadRef = useRef(Boolean(initialRegistry));
  const [giftQuantities, setGiftQuantities] = useState<Record<string, number>>({});
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"auto" | "custom">("auto");

  useEffect(() => {
    if (initialRegistry || !shareCode) {
      return;
    }

    const cachedEntry = readPublicRegistryCache(shareCode);
    if (!cachedEntry) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setRegistry(cachedEntry.registry);
      setRegistryItems(cachedEntry.items);
      setShippingAddress(cachedEntry.shippingAddress);
      setLoading(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [initialRegistry, shareCode]);

  useEffect(() => {
    if (!shareCode || !hasSupabaseEnv) {
      return;
    }

    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false;
      setLoading(false);
      return;
    }

    const loadRegistry = async () => {
      const { data } = await supabase
        .from("registries")
        .select("*")
        .eq("share_code", shareCode)
        .maybeSingle();

      const typedRegistry = (data as RegistryRecord | null) ?? null;
      setRegistry(typedRegistry);

      if (!typedRegistry) {
        setRegistryItems([]);
        setShippingAddress(null);
        setLoading(false);
        return;
      }

      const { data: itemRows } = await supabase
        .from("registry_items")
        .select("*, products(*)")
        .eq("registry_id", typedRegistry.id)
        .order("created_at", { ascending: false });

      setRegistryItems(
        ((itemRows as RegistryItemRecord[] | null) ?? []).map(mapRegistryItemRecord),
      );
      setLoading(false);
    };

    void loadRegistry();
  }, [shareCode]);

  useEffect(() => {
    if (!shareCode) {
      return;
    }

    persistPublicRegistryCache(shareCode, {
      items: registryItems,
      registry,
      shippingAddress,
    });
  }, [registry, registryItems, shareCode, shippingAddress]);

  const selectedItems = useMemo<RegistryGiftSelection[]>(() => {
    return registryItems
      .filter((item) => {
        return (
          getRemainingRegistryQuantity(item) > 0 &&
          getRegistryItemRemainingAmount(item) > 0
        );
      })
      .map((item) => ({
        item,
        quantity: giftQuantities[item.id] ?? 0,
      }))
      .filter((selection) => selection.quantity > 0);
  }, [giftQuantities, registryItems]);

  const giftableRegistryItems = useMemo(() => {
    return registryItems.filter((item) => {
      return (
        getRemainingRegistryQuantity(item) > 0 &&
        getRegistryItemRemainingAmount(item) > 0
      );
    });
  }, [registryItems]);

  const selectedItemsTargetAmount = useMemo(() => {
    return selectedItems.reduce((sum, selection) => {
      return sum + getRegistryItemSelectionAmount(selection.item, selection.quantity);
    }, 0);
  }, [selectedItems]);

  const autoAmount = selectedItemsTargetAmount;

  const paymentAmount = useMemo(() => {
    if (paymentMode === "auto") {
      return autoAmount;
    }

    const parsedValue = Number(paymentAmountInput);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return 0;
    }

    return Math.round(parsedValue);
  }, [paymentMode, paymentAmountInput, autoAmount]);

  const requestedCount = registryItems.reduce(
    (sum, item) => sum + item.requestedQuantity,
    0,
  );
  const purchasedCount = registryItems.reduce(
    (sum, item) => sum + item.purchasedQuantity,
    0,
  );
  const remainingCount = registryItems.reduce(
    (sum, item) => sum + getRemainingRegistryQuantity(item),
    0,
  );
  const remainingAmount = registryItems.reduce(
    (sum, item) => sum + getRegistryItemRemainingAmount(item),
    0,
  );
  const paymentFallsShortOfSelection =
    selectedItems.length > 0 && paymentAmount < selectedItemsTargetAmount;
  const registryIsClosed = registry?.status === "closed";

  const handleQuantityChange = (item: RegistryItem, nextQuantity: number) => {
    const remaining = getRemainingRegistryQuantity(item);
    const clampedQuantity = Math.max(0, Math.min(remaining, nextQuantity));

    setGiftQuantities((current) => ({
      ...current,
      [item.id]: clampedQuantity,
    }));
  };

  const handleShareRegistry = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const shareUrl = window.location.href;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Registry link copied to clipboard!");
  };

  const reloadRegistryItems = async () => {
    if (!registry || !hasSupabaseEnv) {
      return;
    }

    const { data: itemRows } = await supabase
      .from("registry_items")
      .select("*, products(*)")
      .eq("registry_id", registry.id)
      .order("created_at", { ascending: false });

    setRegistryItems(
      ((itemRows as RegistryItemRecord[] | null) ?? []).map(mapRegistryItemRecord),
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-3 md:h-16 md:px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Baby className="h-7 w-7 flex-shrink-0 text-pink-500 md:h-8 md:w-8" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold text-gray-900 md:text-lg">
                Nana&apos;s Baby
              </span>
              <span className="truncate text-xs text-gray-700 md:text-sm">
                Registry
              </span>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="sm" className="px-2 text-xs md:px-3 md:text-sm">
              <Link href="/registry">Browse Registry</Link>
            </Button>

            <Button asChild size="sm" className="px-2 text-xs md:px-3 md:text-sm">
              <Link href="/">Back Home</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="bg-gradient-to-br from-pink-50 via-white to-blue-50 py-10 md:py-20">
        <div className="container mx-auto px-3 md:px-4">
          <div className="mx-auto max-w-3xl">
            {loading ? (
              <Card>
                <CardContent className="space-y-6 p-4 md:space-y-8 md:p-10">
                  Loading registry...
                </CardContent>
              </Card>
            ) : !hasSupabaseEnv ? (
              <Card>
                <CardContent className="space-y-6 p-4 md:space-y-8 md:p-10">
                  Connect Supabase to load public registry pages.
                </CardContent>
              </Card>
            ) : !registry ? (
              <Card>
                <CardContent className="space-y-6 p-4 md:space-y-8 md:p-10">
                  <h1 className="text-3xl font-bold text-gray-900">Registry Not Found</h1>
                  <p className="text-gray-600">
                    This registry link may be invalid or no longer available.
                  </p>
                  <Button asChild>
                    <Link href="/registry">Create or Browse Registries</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden shadow-xl">
                <CardContent className="space-y-6 p-4 md:space-y-8 md:p-10">
                  <div className="space-y-3 text-center md:space-y-4">
                    <Badge variant="secondary" className="px-3 py-1 text-xs md:text-sm">
                      Shared Registry
                    </Badge>
                    <h1 className="text-2xl font-bold text-gray-900 md:text-5xl">
                      {registry.name}
                    </h1>
                    <p className="text-sm text-gray-600 md:text-lg">
                      Celebrate this growing family with a thoughtful gift from
                      Nana&apos;s Baby Essentials.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                    <div className="rounded-2xl border border-pink-200/40 bg-pink-100/70 p-4 md:p-5">
                      <p className="text-xs font-medium uppercase tracking-[0.15em] text-pink-700 md:text-sm">
                        Share Code
                      </p>
                      <p className="break-all text-base font-semibold text-gray-900 md:text-lg">
                        {registry.share_code}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-blue-200/40 bg-blue-100/70 p-4 md:p-5">
                      <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.15em] text-blue-700 md:text-sm">
                        <CalendarClock className="h-4 w-4" />
                        Due Month
                      </p>
                      <p className="text-base font-semibold text-gray-900 md:text-lg">
                        {formatDueMonth(registry.due_month)}
                      </p>
                    </div>

                    <div className="col-span-2 rounded-2xl border border-purple-200/40 bg-purple-100/70 p-4 md:col-span-1 md:p-5">
                      <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.15em] text-purple-700 md:text-sm">
                        <Gift className="h-4 w-4" />
                        Baby&apos;s Gender
                      </p>
                      <p className="text-base font-semibold text-gray-900 md:text-lg">
                        {formatBabyGender(registry.baby_gender)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                    <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 md:p-5">
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 md:text-sm">
                        Items Requested
                      </p>
                      <p className="mt-2 text-xl font-bold text-gray-900 md:text-3xl">
                        {requestedCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-green-50 to-white p-4 md:p-5">
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 md:text-sm">
                        Items Covered
                      </p>
                      <p className="mt-2 text-xl font-bold text-green-600 md:text-3xl">
                        {purchasedCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-pink-50 to-white p-4 md:p-5">
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 md:text-sm">
                        Items Left
                      </p>
                      <p className="mt-2 text-xl font-bold text-pink-600 md:text-3xl">
                        {remainingCount}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-2xl border border-gray-200 bg-gradient-to-br from-purple-50 to-white p-4 md:col-span-3 md:justify-self-center md:w-1/2 md:p-5">
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 md:text-center md:text-sm">
                        Amount Left
                      </p>
                      <p className="mt-2 text-xl font-bold text-purple-600 md:text-center md:text-3xl">
                        {formatNairaAmount(remainingAmount)}
                      </p>
                    </div>
                  </div>

                  {registry.additional_info ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
                      <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-500 md:mb-3 md:text-sm">
                        A Note from the Parent
                      </p>
                      <p className="text-sm leading-relaxed text-gray-700 md:text-base">
                        {registry.additional_info}
                      </p>
                    </div>
                  ) : null}

                  <div className="rounded-2xl bg-gray-50 p-4 md:p-6">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 md:h-12 md:w-12">
                        <Gift className="h-5 w-5 text-pink-600 md:h-6 md:w-6" />
                      </div>

                      <h2 className="text-lg font-bold text-gray-900 md:text-2xl">
                        {registryIsClosed ? "Registry Closed" : "Choose Items to Gift"}
                      </h2>
                    </div>
                    <p className="mt-3 w-full max-w-none text-sm text-gray-600 md:mt-4 md:text-base">
                      {registryIsClosed
                        ? "This registry has been closed by the customer. You can still view it, but gifting is no longer available."
                        : "You can pay for some of the registry items below, make a custom contribution, or do both together without creating an account."}
                    </p>

                    <div className="mt-4">
                      <Button type="button" variant="outline" onClick={handleShareRegistry} className="w-full md:w-auto">
                        <Share2 className="mr-2 h-4 w-4" />
                        Copy Share Link
                      </Button>
                    </div>
                  </div>

                  {!registryIsClosed ? (
                    <>
                      <div className="space-y-4">
                        {giftableRegistryItems.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
                            {registryItems.length === 0
                              ? "This registry is live, but no items have been added yet."
                              : "All product gifts in this registry have already been covered."}
                          </div>
                        ) : (
                          giftableRegistryItems.map((item) => {
                        const remaining = getRemainingRegistryQuantity(item);
                        const selectedQuantity = giftQuantities[item.id] ?? 0;

                        return (
                          <div
                            key={item.id}
                            className="grid gap-5 rounded-3xl border bg-white p-4 shadow-sm md:grid-cols-[140px,1fr] md:p-5"
                          >
                            <div className="aspect-square overflow-hidden rounded-2xl bg-gray-100 md:aspect-auto">
                              {item.product?.image ? (
                                <ImageWithFallback
                                  src={item.product.image}
                                  alt={item.product.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>

                            <div className="space-y-3 md:space-y-4">
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <h3 className="text-lg font-bold leading-snug text-gray-900 md:text-2xl">
                                    {item.product?.name ?? "Registry Item"}
                                  </h3>

                                  <p className="mt-1 text-xs leading-relaxed text-gray-600 md:mt-2 md:text-sm">
                                    {item.product?.description}
                                  </p>

                                  {item.note ? (
                                    <p className="mt-2 rounded-xl bg-pink-50 px-3 py-2 text-xs text-pink-900 md:mt-3 md:text-sm">
                                      Parent note: {item.note}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="text-left md:text-right">
                                  <p className="text-sm font-medium text-gray-500 md:text-xl">
                                    Price
                                  </p>
                                  <p className="text-lg font-bold text-pink-600 md:text-xl">
                                    {formatNairaAmount(toNairaAmount(item.unitPriceSnapshot))}
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5 md:text-sm">
                                <div className="rounded-xl bg-gray-50 p-2 md:p-3">
                                  <p className="font-semibold text-gray-900">Requested</p>
                                  <p className="mt-1 text-gray-600">{item.requestedQuantity}</p>
                                </div>

                                <div className="rounded-xl bg-gray-50 p-2 md:p-3">
                                  <p className="font-semibold text-gray-900">Covered</p>
                                  <p className="mt-1 text-gray-600">{item.purchasedQuantity}</p>
                                </div>

                                <div className="rounded-xl bg-gray-50 p-2 md:p-3">
                                  <p className="font-semibold text-gray-900">Left</p>
                                  <p className="mt-1 text-gray-600">{remaining}</p>
                                </div>

                                <div className="rounded-xl bg-gray-50 p-2 md:p-3">
                                  <p className="font-semibold text-gray-900">Funded</p>
                                  <p className="mt-1 text-gray-600">
                                    {formatNairaAmount(getRegistryItemFundedAmount(item))}
                                  </p>
                                </div>

                                <div className="col-span-2 rounded-xl bg-gray-50 p-2 md:col-span-1 md:p-3">
                                  <p className="font-semibold text-gray-900">Amount Left</p>
                                  <p className="mt-1 text-gray-600">
                                    {formatNairaAmount(getRegistryItemRemainingAmount(item))}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex w-full items-center justify-between sm:justify-start sm:gap-4">
                                  <div className="inline-flex items-center gap-2 rounded-full border bg-white px-2 py-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 md:h-9 md:w-9"
                                      onClick={() =>
                                        handleQuantityChange(item, selectedQuantity - 1)
                                      }
                                      disabled={selectedQuantity <= 0}
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>

                                    <span className="min-w-8 text-center text-sm font-semibold text-gray-900 md:text-base">
                                      {selectedQuantity}
                                    </span>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 md:h-9 md:w-9"
                                      onClick={() =>
                                        handleQuantityChange(item, selectedQuantity + 1)
                                      }
                                      disabled={remaining <= 0}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>

                                  <div className="text-right sm:text-left">
                                    <p className="text-xs font-semibold text-gray-900 md:text-sm">
                                      {formatNairaAmount(
                                        toNairaAmount(item.unitPriceSnapshot) * selectedQuantity,
                                      )}
                                    </p>
                                    <p className="text-[10px] text-gray-500 md:text-xs">
                                      Total for selected
                                    </p>
                                  </div>
                                </div>
                                <p className="text-xs leading-relaxed text-gray-500 md:text-sm">
                                  Select how many remaining units you want your payment to apply to.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                          })
                        )}
                      </div>

                      <div className="rounded-3xl border bg-white p-6 shadow-sm">
                        <div className="mb-4">
                          <div className="flex items-center gap-3 md:gap-4">
                            <div className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 md:h-12 md:w-12">
                              <Wallet className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                            </div>

                            <h2 className="text-lg font-bold text-gray-900 md:text-2xl">
                              {paymentMode === "auto" ? "Suggested Gift Amount" : "Custom Gift Amount"}
                            </h2>
                          </div>

                          <p className="mt-3 w-full max-w-none text-sm text-gray-600 md:mt-4 md:text-base">
                            {paymentMode === "auto"
                              ? "This amount is automatically calculated from the items you select."
                              : selectedItems.length > 0
                                ? "Enter an amount that covers the selected items. Anything extra will be added as a cash gift."
                                : "Enter the amount you want to gift to this registry."}
                          </p>
                        </div>

                        <div className="mb-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={paymentMode === "auto" ? "default" : "outline"}
                            onClick={() => {
                              setPaymentMode("auto");
                              setPaymentAmountInput("");
                            }}
                          >
                            Selection Amount
                          </Button>

                          <Button
                            type="button"
                            variant={paymentMode === "custom" ? "default" : "outline"}
                            onClick={() => {
                              setPaymentMode("custom");
                              setPaymentAmountInput(String(autoAmount));
                            }}
                          >
                            Custom Amount
                          </Button>
                        </div>

                        <div className="max-w-xs space-y-3">
                          <Input
                            type="number"
                            min="0"
                            step="500"
                            disabled={paymentMode === "auto"}
                            placeholder={
                              paymentMode === "auto"
                                ? "Auto-calculated from selection"
                                : "Enter amount in NGN"
                            }
                            value={paymentMode === "auto" ? autoAmount : paymentAmountInput}
                            onChange={(event) => setPaymentAmountInput(event.target.value)}
                          />

                          {selectedItems.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-sm text-gray-600">
                                Total from selected items:{" "}
                                <span className="font-semibold text-gray-900">
                                  {formatNairaAmount(autoAmount)}
                                </span>
                              </p>

                              {paymentMode === "custom" ? (
                                <>
                                  <p className="text-sm text-amber-600">
                                    Enter at least the total value of the selected items. Anything above that becomes an extra cash gift.
                                  </p>

                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPaymentAmountInput(String(autoAmount))}
                                  >
                                    Sync to Selection Amount
                                  </Button>
                                </>
                              ) : null}

                              {paymentFallsShortOfSelection ? (
                                <p className="text-sm text-red-600">
                                  The amount must cover the selected items you chose.
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">
                              Select one or more items to enable checkout.
                            </p>
                          )}
                        </div>

                        <div className="mt-6">
                          <Button
                            type="button"
                            onClick={() => setGiftModalOpen(true)}
                            disabled={
                              selectedItems.length === 0 ||
                              paymentAmount <= 0 ||
                              paymentFallsShortOfSelection
                            }
                            className="w-full bg-black text-white hover:bg-black/90"
                          >
                            Continue to Payment
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {registry ? (
        <RegistryGiftCheckoutModal
          open={giftModalOpen}
          onClose={() => setGiftModalOpen(false)}
          registry={registry}
          shippingAddress={shippingAddress}
          selectedItems={selectedItems}
          paymentAmount={paymentAmount}
          onCheckoutComplete={() => {
            setGiftQuantities({});
            setPaymentAmountInput("");
            void reloadRegistryItems();
          }}
        />
      ) : null}

      <Footer />
    </div>
  );
}
