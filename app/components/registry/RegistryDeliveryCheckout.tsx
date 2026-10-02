"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatNairaAmount } from "../../../lib/commerce";
import { downloadOrderReceipt } from "../../../lib/orderReceipt";
import { loadPaystackScript } from "../../lib/loadPaystack";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type Delivery = {funded_amount?:number;id:string;status:string;total:number;shipping_tier:string;shipping_fee:number;discount_amount:number;shipping_label:string;promo_code:string|null;payment_reference:string;shipping_address:{name?:string;phone?:string;address?:string;city?:string;state?:string};created_at:string};
type Quote={funded_amount?:number;id:string;reference:string;amountKobo:number;paid:boolean;total:number;shipping_fee:number;shipping_label:string;discount_amount:number};

export function RegistryDeliveryCheckout({registryId,onUpdated,disabled=false}:{registryId:string;onUpdated:()=>Promise<void>;disabled?:boolean}) {
  const {user}=useAuth();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [funding,setFunding]=useState<{enabled:boolean;locked:boolean;tier:string|null;funded:number;target:number}|null>(null);
  const [isOwner,setIsOwner]=useState(false);
  const [tiers,setTiers]=useState<{code:string;label:string;fee:number}[]>([]);
  const [tier,setTier]=useState("");
  const [promo,setPromo]=useState("");
  const [quote,setQuote]=useState<Quote|null>(null);
  const [delivery,setDelivery]=useState<Delivery|null>(null);
  const [error,setError]=useState("");
  const activeReference=useRef<string|null>(null);
  const completed=useRef(false);
  const handler=useRef<{openIframe:()=>void}|null>(null);
  const [paystackActive,setPaystackActive]=useState(false);
  const post=async (body:Record<string,unknown>)=>{
    const token=(await supabase.auth.getSession()).data.session?.access_token;
    if(!token) throw new Error("Sign in again to arrange delivery.");
    const response=await fetch(`/api/registry/${registryId}/delivery`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok) throw new Error(data.message);return data;
  };
  const load=useCallback(async()=>{
    const token=(await supabase.auth.getSession()).data.session?.access_token;if(!token)return;
    const response=await fetch(`/api/registry/${registryId}/delivery`,{headers:{Authorization:`Bearer ${token}`}});
    const data=await response.json();if(!response.ok)throw new Error(data.message);
    setTiers(data.tiers);setDelivery(data.delivery);setFunding(data.funding);setIsOwner(data.isOwner===true);setError("");
    if(data.delivery?.status==="awaiting_payment") {
      setTier(data.delivery.shipping_tier);setPromo(data.delivery.promo_code??"");
      setQuote({id:data.delivery.id,reference:data.delivery.payment_reference,amountKobo:Math.round(Number(data.delivery.total)*100),paid:false,total:Number(data.delivery.total),shipping_fee:Number(data.delivery.shipping_fee),shipping_label:data.delivery.shipping_label,discount_amount:Number(data.delivery.discount_amount),funded_amount:Number(data.delivery.funded_amount??0)});
    }
    setTier(current=>data.funding?.tier||current||data.tiers[0]?.code||"");
  },[registryId]);
  useEffect(()=>{if(!open)return;const timer=window.setTimeout(()=>{void load().catch(error=>setError(error instanceof Error?error.message:"Could not load delivery."));},0);return()=>window.clearTimeout(timer);},[load,open]);
  useEffect(()=>{if(!paystackActive||!handler.current)return;const frame=window.requestAnimationFrame(()=>{handler.current?.openIframe();handler.current=null;});return()=>window.cancelAnimationFrame(frame);},[paystackActive]);
  const selected=tiers.find(option=>option.code===tier);
  return <>
    <Button type="button" variant="outline" disabled={disabled} onClick={()=>{setPromo("");setQuote(null);setOpen(true);}}>Registry delivery</Button>
    <Dialog open={open} modal={!paystackActive} onOpenChange={value=>{if(!busy&&!paystackActive)setOpen(value);}}><DialogContent className="max-h-[90dvh] overflow-x-hidden overflow-y-auto sm:max-w-lg" showCloseButton={!busy&&!paystackActive} onInteractOutside={event=>{if(busy||paystackActive)event.preventDefault();}}><DialogHeader><DialogTitle>Registry delivery</DialogTitle></DialogHeader>
      {error?<p role="alert" className="text-sm text-red-600">{error}</p>:null}
      {delivery?.status==="paid"?<div className="space-y-3"><p className="font-semibold">Delivery paid</p><p>{delivery.shipping_label}</p><p>{formatNairaAmount(Number(delivery.total))}</p><p className="text-sm">{delivery.shipping_address.address}, {delivery.shipping_address.city}, {delivery.shipping_address.state}</p><Button type="button" variant="outline" onClick={()=>downloadOrderReceipt({id:delivery.id,createdAt:delivery.created_at,customerName:delivery.shipping_address.name,customerPhone:delivery.shipping_address.phone,items:[],paymentMethod:Number(delivery.total)===0?"manual":"paystack",paymentReference:delivery.payment_reference,shippingAddress:delivery.shipping_address,shippingTier:delivery.shipping_label,promoCode:delivery.promo_code,discountAmount:Number(delivery.discount_amount),fundingAmount:Number(delivery.funded_amount??0),status:"paid",total:Number(delivery.total)})}>Download receipt</Button></div>:<form className="space-y-4" onSubmit={async event=>{
        event.preventDefault();setBusy(true);setError("");
        try{
          const session=(await post({action:"initiate",shippingTier:tier,promoCode:promo})).checkout as Quote;
          setQuote(session);
          if(session.paid){await load();await onUpdated();toast.success("Delivery arranged.");return;}
          activeReference.current=session.reference;completed.current=false;
          await loadPaystackScript();
          const key=process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
          if(!key||!window.PaystackPop||!user?.email)throw new Error("Payments are temporarily unavailable.");
          handler.current=window.PaystackPop.setup({key,email:user.email,amount:session.amountKobo,currency:"NGN",ref:session.reference,metadata:{registry_delivery_id:session.id,registry_id:registryId,type:"registry_delivery"},
            callback:(response:{reference:string})=>{completed.current=true;void (async()=>{try{await post({action:"verify",reference:response.reference});await load();await onUpdated();toast.success("Delivery paid.");}catch(error){toast.error(`${error instanceof Error?error.message:"Could not confirm delivery."} Reference: ${response.reference}`);}finally{activeReference.current=null;setPaystackActive(false);setBusy(false);}})();},
            onClose:()=>{if(completed.current)return;void(async()=>{try{if(activeReference.current)await post({action:"cancel",reference:activeReference.current});await load();await onUpdated();}catch(error){setError(error instanceof Error?error.message:"Could not cancel delivery checkout.");}finally{activeReference.current=null;setPaystackActive(false);setBusy(false);}})();}
          });setPaystackActive(true);
        }catch(error){
          if(activeReference.current){await post({action:"cancel",reference:activeReference.current}).catch(()=>null);activeReference.current=null;}
          setError(error instanceof Error?error.message:"Could not arrange delivery.");setBusy(false);
        }finally{if(!activeReference.current)setBusy(false);}
      }}>
        <div className="space-y-2"><Label htmlFor={`delivery-area-${registryId}`}>Delivery area</Label><select id={`delivery-area-${registryId}`} className="min-h-10 w-full min-w-0 rounded-md border p-2 text-sm" disabled={busy||funding?.locked||delivery?.status==="awaiting_payment"} value={tier} onChange={async event=>{const value=event.target.value;setTier(value);setQuote(null);if(funding?.enabled){setBusy(true);try{await post({action:"configure-funding",enabled:true,shippingTier:value});await load();}catch(error){setError(error instanceof Error?error.message:"Could not change delivery area.");}finally{setBusy(false);}}}}><option value="">Select delivery area</option>{tiers.map(option=><option key={option.code} value={option.code}>{option.label} - {formatNairaAmount(Number(option.fee))}</option>)}</select></div>
        {isOwner ? <label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={funding?.enabled??false} disabled={busy||!tier||funding?.locked||delivery?.status==="awaiting_payment"} onChange={async event=>{const enabled=event.target.checked;setBusy(true);setError("");try{await post({action:"configure-funding",enabled,shippingTier:tier});await load();await onUpdated();}catch(error){setError(error instanceof Error?error.message:"Could not change delivery funding.");}finally{setBusy(false);}}}/>Allow delivery gifts</label> : null}
        <div className="space-y-2"><Label htmlFor={`delivery-promo-${registryId}`}>Promo codes (optional)</Label><div className="flex gap-2"><Input id={`delivery-promo-${registryId}`} className="min-w-0" maxLength={204} placeholder="CODE1, CODE2" value={promo} disabled={busy||delivery?.status==="awaiting_payment"} onChange={event=>{setPromo(event.target.value.toUpperCase());setQuote(null);}}/><Button type="button" variant="outline" disabled={busy||!tier||delivery?.status==="awaiting_payment"} onClick={async()=>{setBusy(true);setError("");try{setQuote((await post({action:"quote",shippingTier:tier,promoCode:promo})).checkout);}catch(error){setError(error instanceof Error?error.message:"Could not apply promo.");}finally{setBusy(false);}}}>Apply</Button></div></div>
        <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm"><div className="flex justify-between gap-2"><span>Delivery fee</span><span>{formatNairaAmount(Number(quote?.shipping_fee??selected?.fee??0))}</span></div>{quote&&Number(quote.discount_amount)>0?<div className="flex justify-between gap-2 text-green-700"><span>Discount</span><span>-{formatNairaAmount(Number(quote.discount_amount))}</span></div>:null}{Number(quote?.funded_amount??funding?.funded??0)>0?<div className="flex justify-between gap-2"><span>Delivery gifts</span><span>-{formatNairaAmount(Number(quote?.funded_amount??funding?.funded??0))}</span></div>:null}<div className="flex justify-between gap-2 font-semibold"><span>Total</span><span>{formatNairaAmount(Number(quote?.total??Math.max(Number(selected?.fee??0)-Number(funding?.funded??0),0)))}</span></div></div>
        {delivery?.status==="awaiting_payment"?<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await post({action:"verify",reference:delivery.payment_reference});await load();await onUpdated();toast.success("Delivery paid.");}catch(error){setError(error instanceof Error?error.message:"Could not check payment.");}finally{setBusy(false);}}}>Check payment</Button><Button type="button" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await post({action:"cancel",reference:delivery.payment_reference});setQuote(null);setPromo("");await load();await onUpdated();}catch(error){setError(error instanceof Error?error.message:"Could not cancel payment.");}finally{setBusy(false);}}}>Cancel payment</Button></div>:null}
        <Button className="w-full" type="submit" disabled={busy||!tier}>{busy?"Processing...":delivery?.status==="awaiting_payment"?"Resume payment":quote?.total===0?"Confirm delivery":"Pay delivery"}</Button>
      </form>}
    </DialogContent></Dialog>
  </>;
}
