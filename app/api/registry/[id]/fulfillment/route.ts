import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { requireRouteUser } from "@/lib/authServer";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type FulfillmentStatus =
  | "collecting"
  | "ready_for_shipping"
  | "shipped"
  | "completed";

type RegistryRow = {
  fulfillment_status?: FulfillmentStatus | null;
  id: string;
  user_id: string;
};

const FULFILLMENT_STATUSES = new Set<FulfillmentStatus>([
  "collecting",
  "ready_for_shipping",
  "shipped",
  "completed",
]);

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/registry/[id]/fulfillment">,
) {
  const routeUser = await requireRouteUser(request);
  if (routeUser.response) {
    return routeUser.response;
  }

  if (!hasSupabaseServiceRoleEnv) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const payload = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  const nextStatus =
    typeof payload?.status === "string"
      ? (payload.status.trim() as FulfillmentStatus)
      : null;

  if (!nextStatus || !FULFILLMENT_STATUSES.has(nextStatus)) {
    return NextResponse.json(
      { message: "Choose a valid registry fulfilment status." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const adminClient = createSupabaseServiceRoleClient();
  if (!adminClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { data: registryData, error: registryError } = await adminClient
    .from("registries")
    .select("id, user_id, fulfillment_status")
    .eq("id", id)
    .maybeSingle();
  const registry = registryData as RegistryRow | null;

  if (registryError || !registry) {
    return NextResponse.json(
      { message: registryError?.message || "Registry not found." },
      { status: registryError ? 400 : 404 },
    );
  }

  const isAdmin = Boolean(routeUser.profile?.is_admin);
  const isOwner = registry.user_id === routeUser.user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ message: "You cannot update this registry." }, { status: 403 });
  }

  const currentStatus = registry.fulfillment_status ?? "collecting";
  const allowedTransitions: Record<FulfillmentStatus, FulfillmentStatus[]> = {
    collecting: ["ready_for_shipping"],
    ready_for_shipping: ["collecting", "shipped"],
    shipped: ["completed"],
    completed: [],
  };

  if (nextStatus !== currentStatus && !allowedTransitions[currentStatus].includes(nextStatus)) {
    return NextResponse.json(
      { message: `Registry cannot move from ${currentStatus} to ${nextStatus}.` },
      { status: 400 },
    );
  }

  if (nextStatus === "shipped" && !isAdmin) {
    return NextResponse.json(
      { message: "Only support or an administrator can mark a registry as shipped." },
      { status: 403 },
    );
  }
  if (nextStatus === "shipped") {
    const delivery = await adminClient.from("registry_delivery_orders").select("id").eq("registry_id", registry.id).eq("status", "paid").maybeSingle();
    if (delivery.error || !delivery.data) return NextResponse.json({ message: "Registry delivery must be paid before dispatch." }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {
    fulfillment_status: nextStatus,
    fulfillment_updated_at: new Date().toISOString(),
    fulfillment_updated_by: routeUser.user.id,
  };

  if (nextStatus === "ready_for_shipping") {
    const { data: delivery, error: deliveryError } = await adminClient.from("registry_delivery_orders")
      .select("id").eq("registry_id", registry.id).eq("status", "paid").maybeSingle();
    if (deliveryError || !delivery) return NextResponse.json({ message: "Pay the registry delivery fee before requesting shipment." }, { status: 400 });
    updatePayload.status = "closed";
    updatePayload.closed_at = new Date().toISOString();
    updatePayload.closed_note = "Registry marked ready for shipping.";
    updatePayload.ready_for_shipping_at = new Date().toISOString();
    updatePayload.shipped_at = null;
    updatePayload.completed_at = null;
  } else if (nextStatus === "collecting") {
    updatePayload.status = "active";
    updatePayload.closed_at = null;
    updatePayload.closed_note = null;
    updatePayload.ready_for_shipping_at = null;
    updatePayload.shipped_at = null;
    updatePayload.completed_at = null;
  } else if (nextStatus === "shipped") {
    updatePayload.shipped_at = new Date().toISOString();
  } else if (nextStatus === "completed") {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { data: updatedRegistry, error: updateError } = await adminClient
    .from("registries")
    .update(updatePayload)
    .eq("id", registry.id)
    .select(
      "id, user_id, name, share_code, status, closed_at, closed_note, fulfillment_status, ready_for_shipping_at, shipped_at, completed_at, fulfillment_updated_at",
    )
    .single();

  if (updateError) {
    return NextResponse.json(
      { message: updateError.message || "Registry fulfilment status could not be updated." },
      { status: 400 },
    );
  }

  revalidateTag("registries", "max");
  return NextResponse.json({
    message:
      nextStatus === "ready_for_shipping"
        ? "Registry is ready for shipping and is closed to new gifts."
        : nextStatus === "collecting"
          ? "Registry is collecting gifts again."
          : nextStatus === "shipped"
            ? "Registry marked as shipped."
            : "Registry marked as completed.",
    registry: updatedRegistry,
  });
}
