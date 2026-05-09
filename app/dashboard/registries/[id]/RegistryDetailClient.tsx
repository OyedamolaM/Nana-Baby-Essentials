"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Gift, Pencil, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatNairaAmount } from "../../../../lib/commerce";
import {
  buildRegistryPaymentActivities,
  formatBabyGender,
  formatDueMonth,
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
  type RegistryRecord,
} from "../../../../lib/registry";
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
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(Boolean(user && hasSupabaseEnv));
  const [registry, setRegistry] = useState<RegistryRecord | null>(null);
  const [registryItems, setRegistryItems] = useState<RegistryItem[]>([]);
  const [payments, setPayments] = useState<RegistryPaymentActivity[]>([]);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegistryItem | null>(null);
  const [editRequestedQuantity, setEditRequestedQuantity] = useState("1");
  const [editNote, setEditNote] = useState("");
  const [savingItem, setSavingItem] = useState(false);
  const [togglingRegistry, setTogglingRegistry] = useState(false);

  const loadRegistry = useCallback(async () => {
    if (!user || !hasSupabaseEnv) {
      return;
    }

    setLoading(true);

    const { data: registryData } = await supabase
      .from("registries")
      .select("*")
      .eq("id", registryId)
      .eq("user_id", user.id)
      .maybeSingle();

    const typedRegistry = (registryData as RegistryRecord | null) ?? null;
    setRegistry(typedRegistry);

    if (!typedRegistry) {
      setRegistryItems([]);
      setPayments([]);
      setLoading(false);
      return;
    }

    const [{ data: itemRows }, { data: orderRows }, { data: contributionRows }] =
      await Promise.all([
        supabase
          .from("registry_items")
          .select("*, products(*)")
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

    setRegistryItems(items);
    setPayments(
      buildRegistryPaymentActivities({
        contributions,
        orderItems,
        orders,
        registryItems: items,
      }),
    );
    setLoading(false);
  }, [registryId, user]);

  useEffect(() => {
    if (!user || !hasSupabaseEnv) {
      return;
    }

    queueMicrotask(() => {
      void loadRegistry();
    });
  }, [loadRegistry, user]);

  const summary = useMemo(() => summarizeRegistryItems(registryItems), [registryItems]);
  const registryIsClosed = registry?.status === "closed";

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
    if (!registry) {
      return;
    }

    const lines = [
      `${registry.name} Checklist`,
      `Share Code: ${registry.share_code}`,
      `Status: ${registryIsClosed ? "Closed" : "Active"}`,
      "",
      ...registryItems.map((item) => {
        return [
          item.product?.name ?? "Registry item",
          `Requested: ${item.requestedQuantity}`,
          `Covered: ${item.purchasedQuantity}`,
          `Remaining: ${getRemainingRegistryQuantity(item)}`,
          item.note ? `Note: ${item.note}` : null,
        ]
          .filter(Boolean)
          .join(" | ");
      }),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${registry.share_code.toLowerCase()}-checklist.txt`;
    link.click();
    URL.revokeObjectURL(url);
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

    const nextRequestedQuantity = Math.max(1, Math.floor(Number(editRequestedQuantity)));
    if (nextRequestedQuantity < editingItem.purchasedQuantity) {
      toast.error("Requested quantity cannot be lower than items already covered.");
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

  const handleToggleRegistryStatus = async () => {
    if (!registry) {
      return;
    }

    const nextStatus = registryIsClosed ? "active" : "closed";
    const confirmMessage = registryIsClosed
      ? "Reopen this registry so it can accept gifts again?"
      : "Close this registry? Guests will still be able to view it, but they will no longer be able to gift items.";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setTogglingRegistry(true);

    const { error } = await supabase
      .from("registries")
      .update({ status: nextStatus })
      .eq("id", registry.id);

    setTogglingRegistry(false);

    if (error) {
      toast.error("Could not update the registry status.");
      return;
    }

    toast.success(nextStatus === "closed" ? "Registry closed." : "Registry reopened.");
    await loadRegistry();
  };

  if (authLoading) {
    return <div className="container mx-auto px-4 py-10">Loading registry...</div>;
  }

  if (!user) {
    return (
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
    );
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-10">Loading registry...</div>;
  }

  if (!registry) {
    return (
      <div className="container mx-auto px-4 py-10">
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
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[32px] border bg-white p-6 shadow-sm md:flex-row md:items-start md:justify-between">
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

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleShareRegistry}>
              <Share2 className="mr-2 h-4 w-4" />
              Share Registry
            </Button>
            <Button variant="outline" onClick={handleDownloadChecklist}>
              <Download className="mr-2 h-4 w-4" />
              Download Checklist
            </Button>
            <Button variant="outline" onClick={() => router.push("/registry")}>
              <Gift className="mr-2 h-4 w-4" />
              Browse Registry Catalog
            </Button>
            <Button
              variant={registryIsClosed ? "default" : "destructive"}
              onClick={handleToggleRegistryStatus}
              disabled={togglingRegistry}
            >
              {togglingRegistry
                ? "Saving..."
                : registryIsClosed
                  ? "Reopen Registry"
                  : "Close Registry"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Requested</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{summary.requested}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Covered</p>
              <p className="mt-2 text-3xl font-bold text-green-600">{summary.purchased}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Still Needed</p>
              <p className="mt-2 text-3xl font-bold text-pink-600">{summary.remainingQuantity}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Amount Left</p>
              <p className="mt-2 text-3xl font-bold text-purple-600">
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
                min={editingItem?.purchasedQuantity ?? 0}
                value={editRequestedQuantity}
                onChange={(event) => setEditRequestedQuantity(event.target.value)}
                required
              />
            </div>

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
    </div>
  );
}
