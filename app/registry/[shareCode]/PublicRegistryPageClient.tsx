"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import {
  formatNairaAmount,
  PRODUCT_LIST_SELECT,
  toNairaAmount,
} from "../../../lib/commerce";
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
import { hasSupabaseEnv, supabase } from "../../lib/supabase";

interface PublicRegistryPageClientProps {
  initialItems: RegistryItem[];
  initialRegistry: RegistryRecord | null;
  shareCode: string;
}

type PublicRegistryCacheEntry = {
  items: RegistryItem[];
  registry: RegistryRecord | null;
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
  shareCode,
}: PublicRegistryPageClientProps) {
  const cachedEntry = useMemo(
    () => (initialRegistry || !shareCode ? undefined : readPublicRegistryCache(shareCode)),
    [initialRegistry, shareCode],
  );
  const [loading, setLoading] = useState(() =>
    Boolean(!initialRegistry && !cachedEntry?.registry && shareCode && hasSupabaseEnv),
  );
  const [registry, setRegistry] = useState<RegistryRecord | null>(
    initialRegistry ?? cachedEntry?.registry ?? null,
  );
  const [registryItems, setRegistryItems] = useState<RegistryItem[]>(
    initialRegistry ? initialItems : cachedEntry?.items ?? initialItems,
  );
  const skipInitialLoadRef = useRef(Boolean(initialRegistry || cachedEntry?.registry));
  const [giftQuantities, setGiftQuantities] = useState<Record<string, number>>({});
  const [selectionOrder, setSelectionOrder] = useState<string[]>([]);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"auto" | "custom">("auto");

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
        setLoading(false);
        return;
      }

      const { data: itemRows } = await supabase
        .from("registry_items")
        .select(`*, products(${PRODUCT_LIST_SELECT})`)
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
    });
  }, [registry, registryItems, shareCode]);

  const selectedItems = useMemo<RegistryGiftSelection[]>(() => {
    const selectableItems = new Map(
      registryItems
        .filter((item) => {
          return (
            getRemainingRegistryQuantity(item) > 0 &&
            getRegistryItemRemainingAmount(item) > 0
          );
        })
        .map((item) => [item.id, item]),
    );

    return selectionOrder
      .map((itemId) => {
        const item = selectableItems.get(itemId);
        if (!item) {
          return null;
        }

        return {
          item,
          quantity: giftQuantities[item.id] ?? 0,
        };
      })
      .filter((selection): selection is RegistryGiftSelection => {
        return Boolean(selection && selection.quantity > 0);
      });
  }, [giftQuantities, registryItems, selectionOrder]);

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

    return Math.round(parsedValue * 100) / 100;
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
  const paymentExceedsSelectionBalance =
    selectedItems.length > 0 && paymentAmount > selectedItemsTargetAmount;
  const registryIsClosed = registry?.status === "closed";

  const handleQuantityChange = (item: RegistryItem, nextQuantity: number) => {
    const remaining = getRemainingRegistryQuantity(item);
    const clampedQuantity = Math.max(0, Math.min(remaining, nextQuantity));
    const currentQuantity = giftQuantities[item.id] ?? 0;

    setGiftQuantities((current) => ({
      ...current,
      [item.id]: clampedQuantity,
    }));

    setSelectionOrder((current) => {
      if (clampedQuantity <= 0) {
        return current.filter((itemId) => itemId !== item.id);
      }

      if (currentQuantity <= 0 && !current.includes(item.id)) {
        return [...current, item.id];
      }

      return current;
    });
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
      .select(`*, products(${PRODUCT_LIST_SELECT})`)
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
            <img
              src="/logo.jpg"
              alt="Nana's Baby Registry logo"
              className="h-7 w-7 shrink-0 md:h-8 md:w-8"
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-serif text-sm font-medium italic tracking-tight text-[#7c3a67] md:text-lg">
                Nana&apos;s Baby
              </span>
              <span className="truncate font-serif text-xs font-medium italic tracking-tight text-[#9a5d84] md:text-sm">
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
                  <p className="section-copy-lg text-center">
                    Loading registry...
                  </p>
                </CardContent>
              </Card>
            ) : !hasSupabaseEnv ? (
              <Card>
                <CardContent className="space-y-6 p-4 md:space-y-8 md:p-10">
                  <p className="section-copy-lg text-center">
                    Connect Supabase to load public registry pages.
                  </p>
                </CardContent>
              </Card>
            ) : !registry ? (
              <Card>
                <CardContent className="space-y-6 p-4 md:space-y-8 md:p-10">
                  <h1 className="section-title text-gray-900">Registry Not Found</h1>
                  <p className="section-copy-lg">
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
                    <h1 className="text-[30px] font-medium leading-tight tracking-tight text-neutral-900 md:text-[48px]">
                      {registry.name}
                    </h1>
                    <p className="section-copy-lg">
                      Celebrate this growing family with a thoughtful gift from
                      Nana&apos;s Baby Essentials.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                    <button
                      type="button"
                      onClick={() => void handleShareRegistry()}
                      className="rounded-2xl border border-pink-200/40 bg-pink-100/70 p-4 text-center transition hover:border-pink-300 hover:bg-pink-100/90 hover:shadow-sm md:p-5"
                    >
                      <p className="flex items-center justify-center gap-2 text-[13px] font-medium tracking-[0.12em] text-pink-700 md:text-[13px]">
                        <Share2 className="h-4 w-4" />
                        Share Code
                      </p>
                      <p className="mt-2 break-all text-[16px] font-medium tracking-tight text-neutral-900 md:text-[22px]">
                        {registry.share_code}
                      </p>
                    </button>

                    <div className="rounded-2xl border border-blue-200/40 bg-blue-100/70 p-4 text-center md:p-5">
                      <p className="mb-1 flex items-center justify-center gap-2 text-[13px] font-medium tracking-[0.12em] text-blue-700 md:text-[13px]">
                        <CalendarClock className="h-4 w-4" />
                        Due Month
                      </p>
                      <p className="mt-2 text-[16px] font-medium tracking-tight text-neutral-900 md:text-[22px]">
                        {formatDueMonth(registry.due_month)}
                      </p>
                    </div>

                    <div className="col-span-2 rounded-2xl border border-purple-200/40 bg-purple-100/70 p-4 text-center md:col-span-1 md:p-5">
                      <p className="mb-1 flex items-center justify-center gap-2 text-[13px] font-medium tracking-[0.12em] text-purple-700 md:text-[13px]">
                        <Gift className="h-4 w-4" />
                        Baby&apos;s Gender
                      </p>
                      <p className="mt-2 text-[16px] font-medium tracking-tight text-neutral-900 md:text-[22px]">
                        {formatBabyGender(registry.baby_gender)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                    <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 text-center md:p-5">
                      <p className="text-[12px] font-medium tracking-[0.12em] text-gray-500 md:text-[12px]">
                        Items Needed
                      </p>
                      <p className="mt-2 text-[22px] font-medium tracking-tight text-neutral-900 md:text-[28px]">
                        {requestedCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-green-50 to-white p-4 text-center md:p-5">
                      <p className="text-[12px] font-medium tracking-[0.12em] text-gray-500 md:text-[12px]">
                        Items Covered
                      </p>
                      <p className="mt-2 text-[22px] font-medium tracking-tight text-green-600 md:text-[28px]">
                        {purchasedCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-pink-50 to-white p-4 text-center md:p-5">
                      <p className="text-[12px] font-medium tracking-[0.12em] text-gray-500 md:text-[12px]">
                        Items Left
                      </p>
                      <p className="mt-2 text-[22px] font-medium tracking-tight text-pink-600 md:text-[28px]">
                        {remainingCount}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-2xl border border-gray-200 bg-gradient-to-br from-purple-50 to-white p-4 text-center md:col-span-3 md:justify-self-center md:w-1/2 md:p-5">
                      <p className="text-[12px] font-medium tracking-[0.12em] text-gray-500 md:text-center md:text-[12px]">
                        Amount Left
                      </p>
                      <p className="mt-2 text-[22px] font-medium tracking-tight text-purple-600 md:text-center md:text-[28px]">
                        {formatNairaAmount(remainingAmount)}
                      </p>
                    </div>
                  </div>

                  {registry.additional_info ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
                      <p className="brand-script-label mb-2 md:mb-3">
                        A Note from the Parent
                      </p>
                      <p className="section-copy">
                        {registry.additional_info}
                      </p>
                    </div>
                  ) : null}

                  <div className="rounded-2xl bg-gray-50 p-4 md:p-6">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 md:h-12 md:w-12">
                        <Gift className="h-5 w-5 text-pink-600 md:h-6 md:w-6" />
                      </div>

                      <h2 className="text-[24px] font-medium tracking-tight text-neutral-900 md:text-[32px]">
                        {registryIsClosed ? "Registry Closed" : "Choose Items to Gift"}
                      </h2>
                    </div>
                    <p className="section-copy mt-3 w-full max-w-none md:mt-4">
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
                          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
                            <p className="section-copy-lg text-gray-500">
                            {registryItems.length === 0
                              ? "This registry is live, but no items have been added yet."
                              : "All product gifts in this registry have already been covered."}
                            </p>
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

                            <div className="space-y-4 md:space-y-5">
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <h3 className="text-[24px] font-medium leading-snug tracking-tight text-neutral-900 md:text-[30px]">
                                    {item.product?.name ?? "Registry Item"}
                                  </h3>

                                  <p className="section-copy mt-1 md:mt-2">
                                    {item.product?.description}
                                  </p>

                                  {item.note ? (
                                    <div className="mt-2 rounded-xl bg-pink-50 px-3 py-2 md:mt-3">
                                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-pink-700 md:text-[12px]">
                                        Parent Note
                                      </p>
                                      <p className="mt-1 text-xs leading-relaxed text-pink-900 md:text-sm">
                                        {item.note}
                                      </p>
                                    </div>
                                  ) : null}
                                </div>

                                <div className="text-left md:text-right">
                                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500 md:text-[12px]">
                                    Price
                                  </p>
                                  <p className="mt-2 text-[24px] font-medium tracking-tight text-pink-600 md:text-[30px]">
                                    {formatNairaAmount(toNairaAmount(item.unitPriceSnapshot))}
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                                <div className="rounded-xl bg-gray-50 p-2 text-center md:p-3">
                                  <p className="text-[12px] font-medium tracking-[0.12em] text-gray-500 md:text-[13px]">Needed</p>
                                  <p className="mt-2 text-sm font-medium tracking-tight text-neutral-900 md:text-base">{item.requestedQuantity}</p>
                                </div>

                                <div className="rounded-xl bg-gray-50 p-2 text-center md:p-3">
                                  <p className="text-[12px] font-medium tracking-[0.12em] text-gray-500 md:text-[13px]">Covered</p>
                                  <p className="mt-2 text-sm font-medium tracking-tight text-neutral-900 md:text-base">{item.purchasedQuantity}</p>
                                </div>

                                <div className="rounded-xl bg-gray-50 p-2 text-center md:p-3">
                                  <p className="text-[12px] font-medium tracking-[0.12em] text-gray-500 md:text-[13px]">Left</p>
                                  <p className="mt-2 text-sm font-medium tracking-tight text-neutral-900 md:text-base">{remaining}</p>
                                </div>

                                <div className="rounded-xl bg-gray-50 p-2 text-center md:p-3">
                                  <p className="text-[12px] font-medium tracking-[0.12em] text-gray-500 md:text-[13px]">Funded</p>
                                  <p className="mt-2 text-sm font-medium tracking-tight text-neutral-900 md:text-base">
                                    {formatNairaAmount(getRegistryItemFundedAmount(item))}
                                  </p>
                                </div>

                                <div className="col-span-2 rounded-xl bg-gray-50 p-2 text-center md:col-span-1 md:p-3">
                                  <p className="text-[12px] font-medium tracking-[0.12em] text-gray-500 md:text-[13px]">Amount Left</p>
                                  <p className="mt-2 text-sm font-medium tracking-tight text-neutral-900 md:text-base">
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

                                    <span className="min-w-8 text-center text-base font-medium tracking-tight text-neutral-900">
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
                                    <p className="text-sm font-medium tracking-tight text-neutral-900 md:text-base">
                                      {formatNairaAmount(
                                        getRegistryItemSelectionAmount(item, selectedQuantity),
                                      )}
                                    </p>
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 md:text-[11px]">
                                      Total for selected
                                    </p>
                                  </div>
                                </div>
                                <p className="text-[12px] leading-relaxed text-gray-500 md:text-sm">
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

                            <h2 className="text-[24px] font-medium tracking-tight text-neutral-900 md:text-[32px]">
                              {paymentMode === "auto" ? "Suggested Gift Amount" : "Custom Gift Amount"}
                            </h2>
                          </div>

                          <p className="section-copy mt-3 w-full max-w-none md:mt-4">
                            {paymentMode === "auto"
                              ? "This amount is automatically calculated from the items you select."
                              : selectedItems.length > 0
                                ? "Enter how much you want to pay toward the selected items. You can pay part of the selected total, but not more than it."
                                : "Enter the amount you want to gift to this registry."}
                          </p>
                        </div>

                        <div className="mb-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={paymentMode === "auto" ? "default" : "outline"}
                            className="font-medium tracking-tight"
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
                            className="font-medium tracking-tight"
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
                            max={
                              paymentMode === "custom" && selectedItems.length > 0
                                ? selectedItemsTargetAmount
                                : undefined
                            }
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
                              <p className="text-sm leading-relaxed text-gray-600 md:text-base">
                                Total from selected items:{" "}
                                <span className="font-medium tracking-tight text-neutral-900">
                                  {formatNairaAmount(autoAmount)}
                                </span>
                              </p>

                              {paymentMode === "custom" ? (
                                <>
                                  <p className="text-sm leading-relaxed text-amber-600 md:text-base">
                                    You can pay any amount up to the selected total. Your payment will be applied across the selected items in the order you chose them.
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

                              {paymentExceedsSelectionBalance ? (
                                <p className="text-sm leading-relaxed text-red-600 md:text-base">
                                  The custom amount cannot be more than the selected item balance.
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-[12px] leading-relaxed text-gray-400 md:text-sm">
                              Enter a custom amount for a general cash gift, or select items to fund specific products.
                            </p>
                          )}
                        </div>

                        <div className="mt-6">
                          <Button
                            type="button"
                            onClick={() => setGiftModalOpen(true)}
                            disabled={
                              paymentAmount <= 0 ||
                              paymentExceedsSelectionBalance
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
          selectedItems={selectedItems}
          paymentAmount={paymentAmount}
          onCheckoutComplete={() => {
            setGiftQuantities({});
            setSelectionOrder([]);
            setPaymentAmountInput("");
            void reloadRegistryItems();
          }}
        />
      ) : null}

      <Footer />
    </div>
  );
}
