import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireRouteUser } from "@/lib/authServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";
import { getPaystackMetadataValue, matchesPaystackOrderAmount, verifyPaystackTransaction } from "@/lib/paystackServer";

export async function GET(request: Request, context: RouteContext<"/api/registry/[id]/delivery">) {
  const actor = await requireRouteUser(request);
  if (actor.response) return actor.response;
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message:"Delivery is temporarily unavailable." },{status:503});
  const {id}=await context.params;
  const access=await client.rpc("get_registry_cash_balance",{p_registry_id:id,p_actor_id:actor.user.id});
  if(access.error) return NextResponse.json({message:"You cannot access this registry."},{status:403});
  const [tiers,delivery]=await Promise.all([
    client.from("shipping_tiers").select("code,label,fee").eq("is_active",true).eq("fulfillment_type","delivery").order("sort_order"),
    client.from("registry_delivery_orders").select("*").eq("registry_id",id).in("status",["paid","awaiting_payment"]).maybeSingle(),
  ]);
  if(tiers.error||delivery.error) return NextResponse.json({message:"Could not load delivery details."},{status:500});
  return NextResponse.json({tiers:tiers.data,delivery:delivery.data});
}

export async function POST(request: Request, context: RouteContext<"/api/registry/[id]/delivery">) {
  const actor=await requireRouteUser(request);
  if(actor.response) return actor.response;
  const client=createSupabaseServiceRoleClient();
  if(!client) return NextResponse.json({message:"Delivery is temporarily unavailable."},{status:503});
  const {id}=await context.params;
  const body=await request.json().catch(()=>null);
  const access=await client.rpc("get_registry_cash_balance",{p_registry_id:id,p_actor_id:actor.user.id});
  if(access.error) return NextResponse.json({message:"You cannot access this registry."},{status:403});
  try {
    if(body?.action==="verify") {
      if(typeof body.reference!=="string") throw new Error("Delivery reference is required.");
      const {data:order,error}=await client.from("registry_delivery_orders").select("*").eq("registry_id",id).eq("payment_reference",body.reference).maybeSingle();
      if(error||!order) throw new Error("Delivery payment not found.");
      const payment=await verifyPaystackTransaction(body.reference);
      if(payment.reference!==body.reference||payment.status!=="success"||payment.currency!=="NGN"||!matchesPaystackOrderAmount(payment,order.total)
        ||getPaystackMetadataValue(payment.metadata,"registry_delivery_id")!==order.id||getPaystackMetadataValue(payment.metadata,"registry_id")!==id) throw new Error("This payment does not match the registry delivery.");
      const result=await client.rpc("complete_registry_delivery_payment",{p_reference:body.reference,p_paid_amount_kobo:Math.round(Number(order.total)*100)});
      if(result.error) throw result.error;
      revalidateTag("registries","max");
      return NextResponse.json({paid:true});
    }
    if(body?.action==="cancel") {
      // A provider success may arrive just before the customer closes its popup.
      // Confirm that payment instead of cancelling the paid delivery record.
      const { data: order } = await client.from("registry_delivery_orders").select("id,total,payment_reference").eq("registry_id",id).eq("payment_reference",body.reference).maybeSingle();
      if (order) {
        const payment = await verifyPaystackTransaction(order.payment_reference).catch(()=>null);
        if (payment?.status==="success" && payment.currency==="NGN" && payment.reference===order.payment_reference
          && matchesPaystackOrderAmount(payment,order.total) && getPaystackMetadataValue(payment.metadata,"registry_delivery_id")===order.id
          && getPaystackMetadataValue(payment.metadata,"registry_id")===id) {
          const complete=await client.rpc("complete_registry_delivery_payment",{p_reference:order.payment_reference,p_paid_amount_kobo:Math.round(Number(order.total)*100)});
          if(complete.error) throw complete.error;
          revalidateTag("registries","max");
          return NextResponse.json({paid:true});
        }
      }
      const result=await client.rpc("cancel_registry_delivery_checkout",{p_registry_id:id,p_actor_id:actor.user.id,p_reference:body.reference});
      if(result.error) throw result.error;
      revalidateTag("registries","max");
      return NextResponse.json({cancelled:true});
    }
    if(body?.action!=="quote"&&body?.action!=="initiate") throw new Error("Choose a valid delivery action.");
    if(typeof body.shippingTier!=="string"||!body.shippingTier.trim()) throw new Error("Select a delivery area.");
    const params={p_registry_id:id,p_actor_id:actor.user.id,p_shipping_tier:body.shippingTier,p_promo_code:typeof body.promoCode==="string"?body.promoCode.trim():null};
    const result=await client.rpc(body.action==="quote"?"get_registry_delivery_quote":"create_registry_delivery_checkout",{
      ...params,...(body.action==="initiate"?{p_reference:`NBE-REG-DEL-${crypto.randomUUID()}`}:{})
    });
    if(result.error) throw result.error;
    if(body.action==="initiate") revalidateTag("registries","max");
    return NextResponse.json({checkout:result.data});
  } catch(error) {
    const message=error instanceof Error?error.message:error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error?String(error.message):"Could not process registry delivery.";
    return NextResponse.json({message},{status:400});
  }
}
