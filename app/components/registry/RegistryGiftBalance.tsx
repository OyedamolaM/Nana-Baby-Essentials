"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatNairaAmount } from "../../../lib/commerce";
import { getRegistryItemRemainingAmount, type RegistryItem } from "../../../lib/registry";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type Balance = { available: number; allocations: { id: string; registry_item_id: string; amount: number; created_at: string }[] };

export function RegistryGiftBalance({ registryId, items, onUpdated, compact = false, disabled = false }: {
  registryId: string; items: RegistryItem[]; onUpdated: () => Promise<void>; compact?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [amounts, setAmounts] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const load = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const response = await fetch(`/api/registry/${registryId}/balance`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    setBalance(data.balance); setError("");
  }, [registryId]);
  useEffect(() => {
    if (compact && !open) return;
    const timer = window.setTimeout(() => { void load().catch(error => setError(error instanceof Error ? error.message : "Could not load balance.")); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, open, compact, items]);
  const total = Math.round(Object.values(amounts).reduce((sum,value) => sum + Number(value || 0),0) * 100) / 100;
  return <>
    {compact ? <Button variant="outline" size="sm" disabled={disabled} onClick={() => { setAmounts({}); requestId.current=null; setOpen(true); }}>Use gift balance</Button> : <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><div><p className="text-sm text-gray-600">Available gift balance</p><p className="text-2xl font-semibold">{balance ? formatNairaAmount(Number(balance.available)) : "..."}</p>{error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}</div><Button disabled={disabled || !balance || Number(balance.available)<=0} onClick={() => { setAmounts({}); requestId.current=null; setOpen(true); }}>Use gift balance</Button></div>}
    {!compact && balance?.allocations.length ? <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Balance activity</summary><div className="mt-3 space-y-3">{balance.allocations.map(entry => <div key={entry.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{items.find(item=>item.id===entry.registry_item_id)?.product?.name ?? "Registry item"}<span className="block text-xs text-gray-500">{new Date(entry.created_at).toLocaleString("en-NG")}</span></span><span>{formatNairaAmount(Number(entry.amount))}</span></div>)}</div></details> : null}
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}><DialogContent className="max-h-[90dvh] overflow-x-hidden overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Use gift balance</DialogTitle></DialogHeader>
      <p className="font-semibold">Available: {formatNairaAmount(Number(balance?.available ?? 0))}</p>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); setSaving(true);
        try {
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          if (!token) throw new Error("Sign in again to use gift balance.");
          requestId.current ??= crypto.randomUUID();
          const allocations = Object.entries(amounts).filter(([,value]) => Number(value)>0).map(([id,value]) => ({ registry_item_id:id,amount:value }));
          const response = await fetch(`/api/registry/${registryId}/balance`, { method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({requestId:requestId.current,allocations}) });
          const data = await response.json(); if (!response.ok) throw new Error(data.message);
          setBalance(data.balance); setOpen(false); await onUpdated(); toast.success("Gift balance applied.");
        } catch(error) { toast.error(error instanceof Error ? error.message : "Could not use gift balance."); }
        finally { setSaving(false); }
      }}>
        {items.filter(item => getRegistryItemRemainingAmount(item)>0).map(item => <div key={item.id} className="space-y-2 rounded-lg border p-3"><Label htmlFor={`allocate-${item.id}`} className="break-words">{item.product?.name ?? "Registry item"}</Label><p className="text-xs text-gray-500">Remaining: {formatNairaAmount(getRegistryItemRemainingAmount(item))}</p><Input id={`allocate-${item.id}`} type="number" inputMode="decimal" min="0" max={Math.min(Number(balance?.available ?? 0),getRegistryItemRemainingAmount(item))} step="0.01" placeholder="Amount (NGN)" disabled={saving} value={amounts[item.id] ?? ""} onChange={event => { requestId.current=null; setAmounts(current => ({...current,[item.id]:event.target.value})); }} /></div>)}
        <p className="font-semibold">Total: {formatNairaAmount(total)}</p><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !Number.isFinite(total) || total<=0 || total>Number(balance?.available ?? 0)}>{saving ? "Saving..." : "Apply balance"}</Button></div>
      </form>
      {balance?.allocations.length ? <div className="space-y-2 border-t pt-3"><p className="font-semibold">Balance activity</p>{balance.allocations.map(entry => <div key={entry.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{items.find(item => item.id===entry.registry_item_id)?.product?.name ?? "Registry item"}</span><span>{formatNairaAmount(Number(entry.amount))}</span></div>)}</div> : null}
    </DialogContent></Dialog>
  </>;
}
