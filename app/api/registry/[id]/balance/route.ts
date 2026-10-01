import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireRouteUser } from "@/lib/authServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";

export async function GET(request: Request, context: RouteContext<"/api/registry/[id]/balance">) {
  const actor = await requireRouteUser(request);
  if (actor.response) return actor.response;
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Registry balance is temporarily unavailable." }, { status: 503 });
  const { id } = await context.params;
  const { data, error } = await client.rpc("get_registry_cash_balance", { p_registry_id: id, p_actor_id: actor.user.id });
  if (error) return NextResponse.json({ message: error.code === "P0001" ? error.message : "Could not load gift balance." }, { status: 400 });
  return NextResponse.json({ balance: data });
}

export async function POST(request: Request, context: RouteContext<"/api/registry/[id]/balance">) {
  const actor = await requireRouteUser(request);
  if (actor.response) return actor.response;
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Registry balance is temporarily unavailable." }, { status: 503 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const { data, error } = await client.rpc("allocate_registry_cash_balance", {
    p_registry_id: id, p_actor_id: actor.user.id, p_request_id: body?.requestId, p_allocations: body?.allocations,
  });
  if (error) return NextResponse.json({ message: error.code === "P0001" ? error.message : "Could not allocate gift balance." }, { status: 400 });
  revalidateTag("registries", "max");
  return NextResponse.json({ balance: data });
}
