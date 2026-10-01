"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { AdminDateTimeField } from "./AdminDateTimeField";

type Promo = { id: string; code: string; percentage: number; is_active: boolean; starts_at: string | null; ends_at: string | null };
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
  const reset = () => { setEditing(null); setCode(""); setPercentage("10"); setStartsAt(""); setEndsAt(""); setActive(true); };
  return <div className="space-y-5">
    <h2 className="text-2xl font-semibold">Discounts & Promos</h2>
   {error ? <p role="alert" className="text-red-600">{error}</p> : null}
    <form className="space-y-4 rounded-lg border bg-white p-4" onSubmit={async event => {
      event.preventDefault(); setSaving(true);
      try {
        const token = await getAdminAccessToken();
        if (!token) throw new Error("Sign in again to manage promos.");
        if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error("Expiry must be after the start.");
        const response = await fetch("/api/admin/promos", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: editing, code, percentage: Number(percentage), isActive: active, startsAt: startsAt ? new Date(startsAt).toISOString() : null, endsAt: endsAt ? new Date(endsAt).toISOString() : null }) });
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
        <div className="space-y-2"><Label htmlFor="promo-percentage">Discount percentage</Label><Input id="promo-percentage" type="number" value={percentage} onChange={event => setPercentage(event.target.value)} min="0.01" max="99.99" step="0.01" required /></div>
        <AdminDateTimeField id="promo-start" label="Starts at (optional)" value={startsAt} onChange={setStartsAt} />
        <AdminDateTimeField id="promo-end" label="Expires at (optional)" value={endsAt} onChange={setEndsAt} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Enable promo code</label>
      <div className="flex gap-2"><Button disabled={saving} type="submit">{saving ? "Saving…" : "Save promo"}</Button>{editing ? <Button type="button" variant="outline" onClick={reset}>Cancel edit</Button> : null}</div>
    </form>
    <div className="space-y-2">{promos.length === 0 && !error ? <p>No promo codes yet.</p> : promos.map(promo => <div key={promo.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
      <div><p className="font-semibold">{promo.code} — {promo.percentage}% off</p><p className="text-sm text-gray-600">{!promo.is_active ? "Disabled" : promo.starts_at && now !== null && Date.parse(promo.starts_at) > now ? "Scheduled" : promo.ends_at && now !== null && Date.parse(promo.ends_at) <= now ? "Expired" : "Active"}</p><p className="text-xs text-gray-500">{promo.starts_at ? new Date(promo.starts_at).toLocaleString() : "Starts immediately"} → {promo.ends_at ? new Date(promo.ends_at).toLocaleString() : "No expiry"}</p></div>
      <Button type="button" variant="outline" disabled={saving} onClick={() => { setEditing(promo.id); setCode(promo.code); setPercentage(String(promo.percentage)); setStartsAt(localDate(promo.starts_at)); setEndsAt(localDate(promo.ends_at)); setActive(promo.is_active); }}>Edit</Button>
    </div>)}</div>
  </div>;
}
