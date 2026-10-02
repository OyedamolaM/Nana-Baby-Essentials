"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { AdminDateTimeField } from "./AdminDateTimeField";
import { formatNairaAmount } from "../../../lib/commerce";
import type { PromoType } from "../../../lib/promos";

type Promo = { id: string; code: string; percentage: number; promo_type?: PromoType; minimum_purchase_amount?: number; maximum_discount_amount?: number | null; applies_to_store?: boolean; applies_to_registry?: boolean; is_active: boolean; starts_at: string | null; ends_at: string | null };
function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AdminPromosManager({ getAdminAccessToken }: { getAdminAccessToken: () => Promise<string | null> }) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [code, setCode] = useState("");
  const [percentage, setPercentage] = useState("10");
  const [minimumPurchaseAmount, setMinimumPurchaseAmount] = useState("");
  const [maximumDiscountAmount, setMaximumDiscountAmount] = useState("");
  const [promoType, setPromoType] = useState<PromoType>("products");
  const [appliesToStore, setAppliesToStore] = useState(true);
  const [appliesToRegistry, setAppliesToRegistry] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const frame = window.requestAnimationFrame(refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const token = await getAdminAccessToken();
        if (!token) throw new Error("Sign in again to manage promos.");
        const response = await fetch("/api/admin/promos", { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        if (mounted) { setPromos(data.promos); setError(""); }
      } catch (error) { if (mounted) setError(error instanceof Error ? error.message : "Could not load promos."); }
    })();
    return () => { mounted = false; };
  }, [getAdminAccessToken]);
  const reset = () => { setEditing(null); setCode(""); setPercentage("10"); setMinimumPurchaseAmount(""); setMaximumDiscountAmount(""); setPromoType("products"); setAppliesToStore(true); setAppliesToRegistry(false); setStartsAt(""); setEndsAt(""); setActive(true); };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Discounts & Promos</h2><Button type="button" disabled={saving} onClick={() => { reset(); setEditorOpen(true); }}>Add promo</Button></div>
   {error ? <p role="alert" className="text-red-600">{error}</p> : null}
    <Dialog open={editorOpen} onOpenChange={open => { if (!saving) { setEditorOpen(open); if (!open) reset(); } }}>
      <DialogContent aria-describedby="promo-editor-description" className="flex max-h-[90dvh] min-w-0 flex-col overflow-hidden p-0 sm:max-w-2xl" showCloseButton={!saving}>
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
          <DialogTitle>{editing ? "Edit promo" : "Create promo"}</DialogTitle>
          <DialogDescription id="promo-editor-description">Choose the offer, purchase requirements, and where customers can use it.</DialogDescription>
        </DialogHeader>
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={async event => {
      event.preventDefault(); setSaving(true);
      try {
        const token = await getAdminAccessToken();
        if (!token) throw new Error("Sign in again to manage promos.");
        if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error("Expiry must be after the start.");
        const response = await fetch("/api/admin/promos", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: editing, code, percentage: promoType === "free_delivery" ? 10 : Number(percentage), promoType, maximumDiscountAmount: maximumDiscountAmount === "" ? null : Number(maximumDiscountAmount), appliesToStore, appliesToRegistry, minimumPurchaseAmount: minimumPurchaseAmount === "" ? 0 : Number(minimumPurchaseAmount), isActive: active, startsAt: startsAt ? new Date(startsAt).toISOString() : null, endsAt: endsAt ? new Date(endsAt).toISOString() : null }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.message);
        const refreshed = await fetch("/api/admin/promos", { headers: { Authorization: `Bearer ${token}` } });
        const refreshedData = await refreshed.json(); if (!refreshed.ok) throw new Error(refreshedData.message);
        setPromos(refreshedData.promos); setError(""); reset(); setEditorOpen(false); toast.success("Promo saved.");
      } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save promo."); }
      finally { setSaving(false); }
    }}>
      <div className="min-h-0 space-y-6 overflow-x-hidden overflow-y-auto px-5 py-5 [overflow-wrap:anywhere]">
      <section className="space-y-3" aria-labelledby="promo-offer-heading">
      <h3 id="promo-offer-heading" className="text-sm font-semibold text-gray-900">Offer details</h3>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0">
        <div className="space-y-2"><Label htmlFor="promo-code">Promo code</Label><Input id="promo-code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="WELCOME10" required minLength={2} maxLength={40} pattern="[A-Za-z0-9_-]+" /></div>
        <div className="space-y-2"><Label htmlFor="promo-type">Promo type</Label><select id="promo-type" className="min-h-10 w-full min-w-0 max-w-full rounded-md border bg-white p-2 text-sm" value={promoType} onChange={event => setPromoType(event.target.value as PromoType)}><option value="products">Percentage off products</option><option value="delivery_discount">Percentage off delivery fee</option><option value="free_delivery">Free delivery (optional cap)</option></select></div>
        {promoType !== "free_delivery" ? <div className="space-y-2"><Label htmlFor="promo-percentage">Discount percentage</Label><Input id="promo-percentage" type="number" value={percentage} onChange={event => setPercentage(event.target.value)} min="0.01" max="99.99" step="0.01" required /></div> : null}
      </div></section>
      <section className="space-y-3 rounded-xl border bg-gray-50 p-4" aria-labelledby="promo-limits-heading">
        <h3 id="promo-limits-heading" className="text-sm font-semibold text-gray-900">Purchase requirements</h3>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="promo-cap">Maximum discount amount (optional, NGN)</Label><Input id="promo-cap" type="number" value={maximumDiscountAmount} onChange={event => setMaximumDiscountAmount(event.target.value)} min="0.01" max="999999999999.99" step="0.01" placeholder="e.g. 50000" /></div>
        <div className="space-y-2"><Label htmlFor="promo-minimum">Minimum purchase amount (optional, NGN)</Label><Input id="promo-minimum" type="number" value={minimumPurchaseAmount} onChange={event => setMinimumPurchaseAmount(event.target.value)} min="0" max="999999999999.99" step="0.01" placeholder="e.g. 500000" /></div>
      </div></section>
      <section className="space-y-3" aria-labelledby="promo-schedule-heading">
        <h3 id="promo-schedule-heading" className="text-sm font-semibold text-gray-900">Schedule</h3>
        <div className="grid min-w-0 gap-4">
        <AdminDateTimeField id="promo-start" label="Starts at (optional)" value={startsAt} onChange={setStartsAt} />
        <AdminDateTimeField id="promo-end" label="Expires at (optional)" value={endsAt} onChange={setEndsAt} />
      </div>
      </section>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Enable promo code</label>
      <fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">Where customers can use this code</legend><label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={appliesToStore} onChange={event => setAppliesToStore(event.target.checked)} /> Store checkout</label><label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={appliesToRegistry} onChange={event => setAppliesToRegistry(event.target.checked)} /> {promoType === "products" ? "Registry products" : "Registry delivery"}</label></fieldset>
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-white px-5 py-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving} onClick={() => { setEditorOpen(false); reset(); }}>Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving…" : "Save promo"}</Button></div>
    </form>
      </DialogContent>
    </Dialog>
    <div className="space-y-2">{promos.length === 0 && !error ? <p>No promo codes yet.</p> : promos.map(promo => <div key={promo.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
      <div><p className="font-semibold">{promo.code}</p><p className="text-sm text-gray-600">{!promo.is_active ? "Disabled" : promo.starts_at && now !== null && Date.parse(promo.starts_at) > now ? "Scheduled" : promo.ends_at && now !== null && Date.parse(promo.ends_at) <= now ? "Expired" : "Active"}</p><p className="text-xs text-gray-500">{promo.starts_at ? new Date(promo.starts_at).toLocaleString() : "Starts immediately"} → {promo.ends_at ? new Date(promo.ends_at).toLocaleString() : "No expiry"}</p></div>
      <div className="text-sm text-gray-600">{Number(promo.minimum_purchase_amount ?? 0) > 0 ? `Minimum purchase: NGN ${Number(promo.minimum_purchase_amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (excluding delivery)` : "No minimum purchase amount"}</div>
      <div className="space-y-1 text-sm text-gray-600"><p>{promo.promo_type === "free_delivery" ? "Delivery fee waiver" : promo.promo_type === "delivery_discount" ? `${promo.percentage}% off delivery` : `${promo.percentage}% off products`}</p><p>{promo.maximum_discount_amount ? `Maximum discount: ${formatNairaAmount(Number(promo.maximum_discount_amount))}` : "No discount cap"}</p><p>{[promo.applies_to_store !== false ? "Store" : "", promo.applies_to_registry ? promo.promo_type && promo.promo_type !== "products" ? "Registry delivery" : "Registry products" : ""].filter(Boolean).join(" / ")}</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => { setEditing(promo.id); setEditorOpen(true); setCode(promo.code); setPercentage(String(promo.percentage)); setPromoType(promo.promo_type ?? "products"); setMaximumDiscountAmount(promo.maximum_discount_amount ? String(promo.maximum_discount_amount) : ""); setAppliesToStore(promo.applies_to_store !== false); setAppliesToRegistry(promo.applies_to_registry === true); setMinimumPurchaseAmount(Number(promo.minimum_purchase_amount ?? 0) > 0 ? String(promo.minimum_purchase_amount) : ""); setStartsAt(localDate(promo.starts_at)); setEndsAt(localDate(promo.ends_at)); setActive(promo.is_active); }}>Edit</Button><Button type="button" variant="destructive" disabled={saving} onClick={async () => {
        if (!window.confirm(`Delete promo ${promo.code}? Existing orders will keep their saved discounts.`)) return;
        setSaving(true);
        try {
          const token = await getAdminAccessToken();
          if (!token) throw new Error("Sign in again to manage promos.");
          const response = await fetch("/api/admin/promos", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: promo.id }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message);
          setPromos(current => current.filter(item => item.id !== promo.id));
          if (editing === promo.id) reset();
          toast.success("Promo deleted.");
        } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete promo."); }
        finally { setSaving(false); }
      }}>Delete</Button></div>
    </div>)}</div>
  </div>;
}
