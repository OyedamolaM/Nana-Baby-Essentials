"use client";
import { useCallback, useEffect, useState } from "react";
import { type RegistryRecord } from "../../../lib/registry";
import { formatNairaAmount } from "../../../lib/commerce";
import { RegistryGiftCheckoutModal } from "./RegistryGiftCheckoutModal";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type Funding = { enabled: boolean; open: boolean; target: number; funded: number; remaining: number };
export function RegistryDeliveryGiftFunding({ registry }: { registry: RegistryRecord }) {
  const [funding, setFunding] = useState<Funding | null>(null);
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/registry/delivery-gifts?registryId=${registry.id}`, { cache: "no-store" });
    if (response.ok) setFunding((await response.json()).funding);
  }, [registry.id]);
  useEffect(() => { let active = true; void fetch(`/api/registry/delivery-gifts?registryId=${registry.id}`, { cache: "no-store" }).then(async response => { if (response.ok && active) setFunding((await response.json()).funding); }).catch(() => {}); return () => { active = false; }; }, [registry.id]);
  if (!funding?.enabled) return null;
  const value = Number(amount);
  return <section className="mx-auto mb-6 w-full max-w-5xl space-y-3 rounded-xl border bg-white p-4">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Delivery</h2><span>{formatNairaAmount(funding.funded)} / {formatNairaAmount(funding.target)}</span></div>
    {funding.open && funding.remaining > 0 ? <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="delivery-gift-amount">Amount (NGN)</Label><Input id="delivery-gift-amount" type="number" min="0.01" max={funding.remaining} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></div><Button disabled={!Number.isFinite(value) || value <= 0 || value > funding.remaining} onClick={() => setOpen(true)}>Gift delivery</Button></div> : null}
    <RegistryGiftCheckoutModal purpose="delivery" open={open} onClose={() => setOpen(false)} registry={registry} selectedItems={[]} paymentAmount={value} onCheckoutComplete={() => { setAmount(""); void load(); }} />
  </section>;
}
