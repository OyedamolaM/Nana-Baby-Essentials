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

  const [loading, setLoading] = useState(() =>
    Boolean(shareCode && hasSupabaseEnv),
  );
  const [registry, setRegistry] = useState<RegistryRecord | null>(null);
  const [registryItems, setRegistryItems] = useState<RegistryItem[]>([]);
  const [giftQuantities, setGiftQuantities] = useState<Record<string, number>>(
    {},
  );
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [giftModalOpen, setGiftModalOpen] = useState(false);

  useEffect(() => {
    if (!shareCode || !hasSupabaseEnv) return;

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
        ((itemRows as RegistryItemRecord[] | null) ?? []).map(
          mapRegistryItemRecord,
        ),
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
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) return 0;
    return Math.round(parsedValue);
  }, [paymentAmountInput]);

  const selectedItemsTargetAmount = useMemo(() => {
    return selectedItems.reduce((sum, selection) => {
      return (
        sum +
        getRegistryItemSelectionAmount(selection.item, selection.quantity)
      );
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

  const paymentExceedsSelection =
    selectedItems.length > 0 &&
    paymentAmount > selectedItemsTargetAmount;

  const handleQuantityChange = (
    item: RegistryItem,
    nextQuantity: number,
  ) => {
    const remaining = getRemainingRegistryQuantity(item);
    const clampedQuantity = Math.max(0, Math.min(remaining, nextQuantity));

    setGiftQuantities((current) => ({
      ...current,
      [item.id]: clampedQuantity,
    }));
  };

  const handleShareRegistry = async () => {
    if (typeof window === "undefined") return;
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Registry link copied to clipboard!");
  };

  const reloadRegistryItems = async () => {
    if (!registry || !hasSupabaseEnv) return;

    const { data: itemRows } = await supabase
      .from("registry_items")
      .select("*, products(*)")
      .eq("registry_id", registry.id)
      .order("created_at", { ascending: false });

    setRegistryItems(
      ((itemRows as RegistryItemRecord[] | null) ?? []).map(
        mapRegistryItemRecord,
      ),
    );
  };

  return (
    <div className="min-h-screen bg-white">

      {/* HEADER (mobile tightened only) */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="container mx-auto flex h-14 md:h-16 items-center justify-between px-3 md:px-4">
          <Link href="/" className="flex items-center gap-2">
            <Baby className="h-7 w-7 md:h-8 md:w-8 text-pink-500" />
            <span className="text-lg md:text-2xl font-semibold text-gray-900 truncate">
              Baby Registry
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/registry">Browse Registry</Link>
            </Button>
            <Button asChild size="sm">
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
                <CardContent className="p-10 text-center text-gray-500">
                  Loading registry...
                </CardContent>
              </Card>
            ) : !registry ? (
              <Card>
                <CardContent className="p-10 text-center text-gray-500">
                  Registry not found
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden shadow-xl">
                <CardContent className="space-y-6 md:space-y-8 p-4 md:p-10">

                  {/* TOP */}
                  <div className="text-center space-y-3">
                    <Badge variant="secondary">Shared Registry</Badge>

                    <h1 className="text-2xl md:text-5xl font-bold">
                      {registry.name}
                    </h1>

                    <p className="text-sm md:text-lg text-gray-600">
                      Celebrate this growing family with a thoughtful gift from Nana&apos;s Baby Essentials.
                    </p>
                  </div>

                  {/* TOP INFO */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
                    <div className="bg-pink-50 p-3 md:p-5 rounded-xl">
                      <p className="text-xs text-pink-500">Share Code</p>
                      <p className="font-bold text-sm md:text-xl">
                        {registry.share_code}
                      </p>
                    </div>

                    <div className="bg-blue-50 p-3 md:p-5 rounded-xl">
                      <p className="text-xs text-blue-500">Due Month</p>
                      <p className="font-semibold">
                        {formatDueMonth(registry.due_month)}
                      </p>
                    </div>

                    <div className="bg-purple-50 p-3 md:p-5 rounded-xl col-span-2 md:col-span-1">
                      <p className="text-xs text-purple-500">Gender</p>
                      <p className="font-semibold">
                        {formatBabyGender(registry.baby_gender)}
                      </p>
                    </div>
                  </div>

                  {/* ITEMS */}
                  <div className="space-y-4">
                    {registryItems.map((item) => {
                      const remaining = getRemainingRegistryQuantity(item);
                      const qty = giftQuantities[item.id] ?? 0;

                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-1 md:grid-cols-[120px,1fr] gap-3 md:gap-4 border rounded-2xl p-3 md:p-5"
                        >
                          <div className="w-full md:w-[120px] aspect-square bg-gray-100 rounded-xl overflow-hidden flex items-center justify-center">
                            {item.product?.image && (
                              <ImageWithFallback
                                src={item.product.image}
                                alt={item.product.name}
                                className="w-full h-full object-contain"
                              />
                            )}
                          </div>

                          <div className="space-y-2 md:space-y-3">
                            <h3 className="font-bold text-lg">
                              {item.product?.name}
                            </h3>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                              <div>Req: {item.requestedQuantity}</div>
                              <div>Cov: {item.purchasedQuantity}</div>
                              <div>Left: {remaining}</div>
                              <div>
                                Funded: {formatNairaAmount(getRegistryItemFundedAmount(item))}
                              </div>
                              <div className="col-span-2 md:col-span-1">
                                Rem: {formatNairaAmount(getRegistryItemRemainingAmount(item))}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button size="icon" variant="ghost"
                                onClick={() => handleQuantityChange(item, qty - 1)}
                              >
                                <Minus />
                              </Button>

                              <span>{qty}</span>

                              <Button size="icon" variant="ghost"
                                onClick={() => handleQuantityChange(item, qty + 1)}
                              >
                                <Plus />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* CASH GIFT (RESTORED + SAFE UI) */}
                  <div className="rounded-2xl border bg-white p-4 md:p-6">
                    <h2 className="font-bold text-lg md:text-xl">
                      Set Your Gift Amount
                    </h2>

                    <Input
                      type="number"
                      value={paymentAmountInput}
                      onChange={(e) => setPaymentAmountInput(e.target.value)}
                      placeholder="Enter amount"
                    />
                  </div>

                  {/* CTA (RESTORED FULL LOGIC) */}
                  <div className="rounded-3xl bg-gradient-to-r from-pink-500 to-purple-600 p-5 md:p-6 text-white">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div>
                        <h2 className="text-xl md:text-2xl font-bold">
                          Ready to send your gift?
                        </h2>
                        <p className="text-pink-50 text-sm md:text-base">
                          Continue to secure Paystack checkout.
                        </p>
                      </div>

                      <Button
                        onClick={() => setGiftModalOpen(true)}
                        disabled={paymentAmount <= 0 || paymentExceedsSelection}
                        className="w-full md:w-auto text-black"
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

      {registry && (
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
      )}

      <Footer />
    </div>
  );
}