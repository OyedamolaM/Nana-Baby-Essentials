"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
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
    <h2 className="text-2xl font-semibold">Discounts & Promos</h2>
   {error ? <p role="alert" className="text-red-600">{error}</p> : null}
    <form className="space-y-4 rounded-lg border bg-white p-4" onSubmit={async event => {
      event.preventDefault(); setSaving(true);
      try {
        const token = await getAdminAccessToken();
        if (!token) throw new Error("Sign in again to manage promos.");
        if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error("Expiry must be after the start.");
        const response = await fetch("/api/admin/promos", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: editing, code, percentage: promoType === "free_delivery" ? 10 : Number(percentage), promoType, maximumDiscountAmount: maximumDiscountAmount === "" ? null : Number(maximumDiscountAmount), appliesToStore, appliesToRegistry, minimumPurchaseAmount: minimumPurchaseAmount === "" ? 0 : Number(minimumPurchaseAmount), isActive: active, startsAt: startsAt ? new Date(startsAt).toISOString() : null, endsAt: endsAt ? new Date(endsAt).toISOString() : null }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.message);
        const refreshed = await fetch("/api/admin/promos", { headers: { Authorization: `Bearer ${token}` } });
        const refreshedData = await refreshed.json(); if (!refreshed.ok) throw new Error(refreshedData.message);
        setPromos(refreshedData.promos); setError(""); reset(); toast.success("Promo saved.");
      } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save promo."); }
      finally { setSaving(false); }
    }}>
      <h3 className="font-semibold">{editing ? "Edit promo" : "Create promo"}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="promo-code">Promo code</Label><Input id="promo-code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="WELCOME10" required minLength={2} maxLength={40} pattern="[A-Za-z0-9_-]+" /></div>
        <div className="space-y-2"><Label htmlFor="promo-type">Promo type</Label><select id="promo-type" className="w-full rounded-md border bg-white p-2 text-sm" value={promoType} onChange={event => { const type = event.target.value as PromoType; setPromoType(type); if (type !== "products") { setAppliesToRegistry(false); setAppliesToStore(true); } }}><option value="products">Percentage off products</option><option value="delivery_discount">Percentage off delivery fee</option><option value="free_delivery">Free delivery (up to an optional cap)</option></select></div>
        {promoType !== "free_delivery" ? <div className="space-y-2"><Label htmlFor="promo-percentage">Discount percentage</Label><Input id="promo-percentage" type="number" value={percentage} onChange={event => setPercentage(event.target.value)} min="0.01" max="99.99" step="0.01" required /></div> : null}
        <div className="space-y-2"><Label htmlFor="promo-cap">Maximum discount amount (optional, NGN)</Label><Input id="promo-cap" type="number" value={maximumDiscountAmount} onChange={event => setMaximumDiscountAmount(event.target.value)} min="0.01" max="999999999999.99" step="0.01" placeholder="e.g. 50000" /><p className="text-xs text-gray-500">The most this code can deduct per purchase. Leave blank for no cap. A capped delivery waiver may leave a delivery balance to pay.</p></div>
        <AdminDateTimeField id="promo-start" label="Starts at (optional)" value={startsAt} onChange={setStartsAt} />
        <div className="space-y-2"><Label htmlFor="promo-minimum">Minimum purchase amount (optional, NGN)</Label><Input id="promo-minimum" type="number" value={minimumPurchaseAmount} onChange={event => setMinimumPurchaseAmount(event.target.value)} min="0" max="999999999999.99" step="0.01" placeholder="e.g. 500000" /><p className="text-xs text-gray-500">Products must total at least this amount before discount. Delivery is excluded. Leave blank for no minimum.</p></div>
        <AdminDateTimeField id="promo-end" label="Expires at (optional)" value={endsAt} onChange={setEndsAt} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Enable promo code</label>
      <div className="space-y-2"><p className="text-sm font-medium">Where customers can use this code</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={appliesToStore} onChange={event => setAppliesToStore(event.target.checked)} /> Store checkout</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={appliesToRegistry} disabled={promoType !== "products"} onChange={event => setAppliesToRegistry(event.target.checked)} /> Registry product gifts</label><p className="text-xs text-gray-500">Registry codes apply to the gift value being funded, including partial product gifts. Cash contributions are excluded. Registry gifting has no delivery fee.</p></div>
      <div className="flex gap-2"><Button disabled={saving} type="submit">{saving ? "Saving…" : "Save promo"}</Button>{editing ? <Button type="button" variant="outline" onClick={reset}>Cancel edit</Button> : null}</div>
    </form>
    <div className="space-y-2">{promos.length === 0 && !error ? <p>No promo codes yet.</p> : promos.map(promo => <div key={promo.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
      <div><p className="font-semibold">{promo.code}</p><p className="text-sm text-gray-600">{!promo.is_active ? "Disabled" : promo.starts_at && now !== null && Date.parse(promo.starts_at) > now ? "Scheduled" : promo.ends_at && now !== null && Date.parse(promo.ends_at) <= now ? "Expired" : "Active"}</p><p className="text-xs text-gray-500">{promo.starts_at ? new Date(promo.starts_at).toLocaleString() : "Starts immediately"} → {promo.ends_at ? new Date(promo.ends_at).toLocaleString() : "No expiry"}</p></div>
      <div className="text-sm text-gray-600">{Number(promo.minimum_purchase_amount ?? 0) > 0 ? `Minimum purchase: NGN ${Number(promo.minimum_purchase_amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (excluding delivery)` : "No minimum purchase amount"}</div>
      <div className="space-y-1 text-sm text-gray-600"><p>{promo.promo_type === "free_delivery" ? "Delivery fee waiver" : promo.promo_type === "delivery_discount" ? `${promo.percentage}% off delivery` : `${promo.percentage}% off products`}</p><p>{promo.maximum_discount_amount ? `Maximum discount: ${formatNairaAmount(Number(promo.maximum_discount_amount))}` : "No discount cap"}</p><p>{[promo.applies_to_store !== false ? "Store" : "", promo.applies_to_registry ? "Registry product gifts" : ""].filter(Boolean).join(" / ")}</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => { setEditing(promo.id); setCode(promo.code); setPercentage(String(promo.percentage)); setPromoType(promo.promo_type ?? "products"); setMaximumDiscountAmount(promo.maximum_discount_amount ? String(promo.maximum_discount_amount) : ""); setAppliesToStore(promo.applies_to_store !== false); setAppliesToRegistry(promo.applies_to_registry === true); setMinimumPurchaseAmount(Number(promo.minimum_purchase_amount ?? 0) > 0 ? String(promo.minimum_purchase_amount) : ""); setStartsAt(localDate(promo.starts_at)); setEndsAt(localDate(promo.ends_at)); setActive(promo.is_active); }}>Edit</Button><Button type="button" variant="destructive" disabled={saving} onClick={async () => {
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
