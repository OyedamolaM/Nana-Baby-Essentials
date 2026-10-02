"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { formatNairaAmount } from "../../../lib/commerce";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type Promo = { code: string | null; subtotal: number; discount: number; locked: boolean };

export function RegistryProductPromo({ registryId, onUpdated, disabled }: { registryId: string; onUpdated: () => Promise<void>; disabled?: boolean }) {
  const [promo, setPromo] = useState<Promo | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(`/api/registry/${registryId}/product-promo`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (active && response.ok) { setPromo(result.promo); setCode(result.promo.code ?? ""); }
    })().catch(() => {});
    return () => { active = false; };
  }, [registryId, onUpdated]);

  const save = async (value: string) => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again.");
      const response = await fetch(`/api/registry/${registryId}/product-promo`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ code: value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setPromo(result.promo); setCode(result.promo.code ?? "");
      await onUpdated();
      toast.success(value ? "Registry promo applied." : "Registry promo removed.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not apply promo."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3 rounded-xl border p-4">
    <Label htmlFor="registry-product-promo">Registry promo code</Label>
    <div className="flex flex-wrap gap-2">
      <Input id="registry-product-promo" className="min-w-0 flex-1" maxLength={40} value={code} disabled={!promo || busy || disabled || promo.locked} onChange={event => setCode(event.target.value.toUpperCase())} />
      <Button disabled={!promo || busy || disabled || promo.locked || !code.trim()} onClick={() => void save(code)}>Apply</Button>
      {promo?.code ? <Button variant="outline" disabled={busy || disabled || promo.locked} onClick={() => void save("")}>Remove</Button> : null}
    </div>
    {promo?.code ? <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{promo.code}{promo.locked ? " · Locked" : ""}</span><span>-{formatNairaAmount(promo.discount)}</span><span>Total {formatNairaAmount(promo.subtotal - promo.discount)}</span></div> : null}
  </div>;
}
