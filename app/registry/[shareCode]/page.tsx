"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
import { RegistryGiftCheckoutModal, type RegistryGiftSelection } from "../../components/registry/RegistryGiftCheckoutModal";
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
  getRegistryItemTargetAmount,
  getRemainingRegistryQuantity,
  mapRegistryItemRecord,
  type RegistryItem,
  type RegistryItemRecord,
  type RegistryRecord,
} from "../../../lib/registry";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";

export default function PublicRegistryPage() {
  const params = useParams<{ shareCode: string }>();
  const shareCode = params?.shareCode ?? "";
  const [loading, setLoading] = useState(() => Boolean(shareCode && hasSupabaseEnv));
  const [registry, setRegistry] = useState<RegistryRecord | null>(null);
  const [registryItems, setRegistryItems] = useState<RegistryItem[]>([]);
  const [giftQuantities, setGiftQuantities] = useState<Record<string, number>>({});
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [giftModalOpen, setGiftModalOpen] = useState(false);

  useEffect(() => {
    if (!shareCode || !hasSupabaseEnv) {
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

  const selectedItems = useMemo<RegistryGiftSelection[]>(() => {
    return registryItems
      .map((item) => ({
        item,
        quantity: giftQuantities[item.id] ?? 0,
      }))
      .filter((selection) => selection.quantity > 0);
  }, [giftQuantities, registryItems]);

  const paymentAmount = useMemo(() => {
    const parsedValue = Number(paymentAmountInput);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return 0;
    }

    return Math.round(parsedValue);
  }, [paymentAmountInput]);

  const selectedItemsTargetAmount = useMemo(() => {
    return selectedItems.reduce((sum, selection) => {
      return sum + getRegistryItemSelectionAmount(selection.item, selection.quantity);
    }, 0);
  }, [selectedItems]);

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
  const totalNeededAmount = registryItems.reduce(
    (sum, item) => sum + getRegistryItemTargetAmount(item),
    0,
  );
  const fundedAmount = registryItems.reduce(
    (sum, item) => sum + getRegistryItemFundedAmount(item),
    0,
  );
  const remainingAmount = registryItems.reduce(
    (sum, item) => sum + getRegistryItemRemainingAmount(item),
    0,
  );
  const paymentExceedsSelection = selectedItems.length > 0 && paymentAmount > selectedItemsTargetAmount;

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
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Baby className="h-8 w-8 text-pink-500" />
            <span className="text-2xl font-semibold text-gray-900">
              Baby Registry
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/registry">Browse Registry</Link>
            </Button>
            <Button asChild>
              <Link href="/">Back Home</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="bg-gradient-to-br from-pink-50 via-white to-blue-50 py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            {loading ? (
              <Card>
                <CardContent className="p-10 text-center text-gray-500">
                  Loading registry...
                </CardContent>
              </Card>
            ) : !hasSupabaseEnv ? (
              <Card>
                <CardContent className="p-10 text-center text-gray-500">
                  Connect Supabase to load public registry pages.
                </CardContent>
              </Card>
            ) : !registry ? (
              <Card>
                <CardContent className="space-y-4 p-10 text-center">
                  <h1 className="text-3xl font-bold text-gray-900">
                    Registry Not Found
                  </h1>
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
                <CardContent className="space-y-8 p-8 md:p-10">
                  <div className="space-y-4 text-center">
                    <Badge variant="secondary" className="px-4 py-1 text-sm">
                      Shared Registry
                    </Badge>
                    <h1 className="text-4xl font-bold text-gray-900 md:text-5xl">
                      {registry.name}
                    </h1>
                    <p className="text-lg text-gray-600">
                      Celebrate this growing family with a thoughtful gift from
                      Nana&apos;s Baby Essentials.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-pink-50 p-5">
                      <p className="mb-2 text-sm font-medium uppercase tracking-[0.18em] text-pink-500">
                        Share Code
                      </p>
                      <p className="font-mono text-xl font-bold text-gray-900">
                        {registry.share_code}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 p-5">
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-blue-500">
                        <CalendarClock className="h-4 w-4" />
                        Due Month
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        {formatDueMonth(registry.due_month)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-purple-50 p-5">
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-purple-500">
                        <Gift className="h-4 w-4" />
                        Baby&apos;s Gender
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        {formatBabyGender(registry.baby_gender)}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5">
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500">
                        Requested
                      </p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">
                        {requestedCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5">
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500">
                        Covered Units
                      </p>
                      <p className="mt-2 text-3xl font-bold text-green-600">
                        {purchasedCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5">
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500">
                        Units Left
                      </p>
                      <p className="mt-2 text-3xl font-bold text-pink-600">
                        {remainingCount}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5">
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500">
                        Total Needed
                      </p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">
                        {formatNairaAmount(totalNeededAmount)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5">
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500">
                        Funded So Far
                      </p>
                      <p className="mt-2 text-3xl font-bold text-green-600">
                        {formatNairaAmount(fundedAmount)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5">
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500">
                        Amount Left
                      </p>
                      <p className="mt-2 text-3xl font-bold text-pink-600">
                        {formatNairaAmount(remainingAmount)}
                      </p>
                    </div>
                  </div>

                  {registry.additional_info && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6">
                      <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-gray-500">
                        A Note from the Parent
                      </p>
                      <p className="leading-relaxed text-gray-700">
                        {registry.additional_info}
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl bg-gray-50 p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                      <div>
                        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-100">
                          <Gift className="h-6 w-6 text-pink-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">
                          Choose Items to Gift
                        </h2>
                        <p className="mt-2 max-w-2xl text-gray-600">
                          You can pay for some of the registry items below, make a
                          custom contribution, or do both together without creating
                          an account.
                        </p>
                      </div>
                      <Button type="button" variant="outline" onClick={handleShareRegistry}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Copy Share Link
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {registryItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
                        This registry is live, but no items have been added yet.
                      </div>
                    ) : (
                      registryItems.map((item) => {
                        const remaining = getRemainingRegistryQuantity(item);
                        const selectedQuantity = giftQuantities[item.id] ?? 0;

                        return (
                          <div
                            key={item.id}
                            className="grid gap-5 rounded-3xl border bg-white p-5 shadow-sm md:grid-cols-[140px,1fr]"
                          >
                            <div className="overflow-hidden rounded-2xl bg-gray-100">
                              {item.product?.image ? (
                                <ImageWithFallback
                                  src={item.product.image}
                                  alt={item.product.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>
                            <div className="space-y-4">
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <h3 className="text-2xl font-bold text-gray-900">
                                    {item.product?.name ?? "Registry Item"}
                                  </h3>
                                  <p className="mt-2 text-sm text-gray-600">
                                    {item.product?.description}
                                  </p>
                                  {item.note ? (
                                    <p className="mt-3 rounded-xl bg-pink-50 px-3 py-2 text-sm text-pink-900">
                                      Parent note: {item.note}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="text-left md:text-right">
                                  <p className="text-sm font-medium text-gray-500">
                                    Suggested price
                                  </p>
                                  <p className="text-xl font-bold text-pink-600">
                                    {formatNairaAmount(
                                      toNairaAmount(item.unitPriceSnapshot),
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                                <div className="rounded-2xl bg-gray-50 p-3">
                                  <p className="font-semibold text-gray-900">Requested</p>
                                  <p className="mt-1 text-gray-600">
                                    {item.requestedQuantity}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-gray-50 p-3">
                                  <p className="font-semibold text-gray-900">Covered Units</p>
                                  <p className="mt-1 text-gray-600">
                                    {item.purchasedQuantity}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-gray-50 p-3">
                                  <p className="font-semibold text-gray-900">Units Left</p>
                                  <p className="mt-1 text-gray-600">{remaining}</p>
                                </div>
                                <div className="rounded-2xl bg-gray-50 p-3">
                                  <p className="font-semibold text-gray-900">Funded</p>
                                  <p className="mt-1 text-gray-600">
                                    {formatNairaAmount(getRegistryItemFundedAmount(item))}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-gray-50 p-3">
                                  <p className="font-semibold text-gray-900">Amount Left</p>
                                  <p className="mt-1 text-gray-600">
                                    {formatNairaAmount(getRegistryItemRemainingAmount(item))}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="inline-flex items-center gap-2 rounded-full border bg-white px-2 py-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      handleQuantityChange(item, selectedQuantity - 1)
                                    }
                                    disabled={selectedQuantity <= 0}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span className="min-w-10 text-center text-sm font-semibold text-gray-900">
                                    {selectedQuantity}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      handleQuantityChange(item, selectedQuantity + 1)
                                    }
                                    disabled={remaining <= 0}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <p className="text-sm text-gray-500">
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
                    <div className="mb-4 flex items-center gap-3">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-100">
                        <Wallet className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          {selectedItems.length > 0 ? "Set Your Gift Amount" : "Make a General Cash Gift"}
                        </h2>
                        <p className="text-sm text-gray-600">
                          {selectedItems.length > 0
                            ? "Choose how much you want to pay now. Your payment will auto-fill the selected items in order and can be a part payment."
                            : "You can still send a general registry cash gift even if you do not choose any specific items."}
                        </p>
                      </div>
                    </div>
                    <div className="max-w-xs space-y-3">
                      <Input
                        type="number"
                        min="0"
                        step="500"
                        placeholder={selectedItems.length > 0 ? "Amount to pay now" : "Cash gift amount in NGN"}
                        value={paymentAmountInput}
                        onChange={(event) => setPaymentAmountInput(event.target.value)}
                      />
                      {selectedItems.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm text-gray-600">
                            The selected items can still receive up to{" "}
                            <span className="font-semibold text-gray-900">
                              {formatNairaAmount(selectedItemsTargetAmount)}
                            </span>
                            .
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPaymentAmountInput(String(selectedItemsTargetAmount))}
                          >
                            Use Full Selected Amount
                          </Button>
                          {paymentExceedsSelection ? (
                            <p className="text-sm text-red-600">
                              The amount entered is higher than the remaining amount on the selected items.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-3xl bg-gradient-to-r from-pink-500 to-purple-600 p-6 text-white">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h2 className="text-2xl font-bold">Ready to send your gift?</h2>
                        <p className="mt-2 max-w-2xl text-pink-50">
                          {selectedItems.length > 0
                            ? "Continue to secure Paystack checkout to pay this amount toward the items you selected."
                            : "Continue to secure Paystack checkout to send your registry cash gift."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={() => setGiftModalOpen(true)}
                        disabled={paymentAmount <= 0 || paymentExceedsSelection}
                        className="text-gray-900"
                      >
                        Continue to Payment
                      </Button>
                    </div>
                  </div>
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
            setPaymentAmountInput("");
            void reloadRegistryItems();
          }}
        />
      ) : null}

      <Footer />
    </div>
  );
}
