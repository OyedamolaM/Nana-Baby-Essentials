import { NextResponse } from "next/server";

import {
  createBrevoIdempotencyKey,
  hasBrevoEnv,
  sendBrevoEmail,
} from "@/lib/brevo";
import { renderOrderConfirmationEmail } from "@/lib/emailTemplates";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabaseServerEnv,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type OrderConfirmationPayload = {
  orderId?: string;
};

type OrderRecord = {
  created_at?: string | null;
  id: string;
  items?: unknown;
  payment_reference?: string | null;
  shipping_address?: unknown;
  shipping_tier?: string | null;
  status: string;
  total: number | string;
  user_id: string;
};

type UserProfileRecord = {
  email?: string | null;
  full_name?: string | null;
};

type StoreOrderItem = {
  name?: string;
  price?: number;
  quantity?: number;
};

type StoreOrderAddress = {
  address?: string;
  city?: string;
  name?: string;
  phone?: string;
  state?: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim() || null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as StoreOrderItem[];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : undefined,
      price: Number(item.price ?? 0),
      quantity: Number(item.quantity ?? 1),
    }))
    .filter((item) => item.price && item.quantity);
}

function normalizeAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const address = value as Record<string, unknown>;
  return {
    address: typeof address.address === "string" ? address.address : undefined,
    city: typeof address.city === "string" ? address.city : undefined,
    name: typeof address.name === "string" ? address.name : undefined,
    phone: typeof address.phone === "string" ? address.phone : undefined,
    state: typeof address.state === "string" ? address.state : undefined,
  } satisfies StoreOrderAddress;
}

export async function POST(request: Request) {
  if (!hasSupabaseServerEnv || !hasSupabaseServiceRoleEnv) {
    return jsonError(
      "Supabase server credentials are not configured for order emails.",
      500,
    );
  }

  if (!hasBrevoEnv) {
    return jsonError("Brevo is not configured for order emails.", 500);
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return jsonError("Unauthorized.", 401);
  }

  const authClient = createSupabaseServerClient();
  const adminClient = createSupabaseServiceRoleClient();

  if (!authClient || !adminClient) {
    return jsonError(
      "Supabase server credentials are not configured for order emails.",
      500,
    );
  }

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return jsonError("Unauthorized.", 401);
  }

  const payload = (await request.json().catch(() => null)) as OrderConfirmationPayload | null;
  const orderId = payload?.orderId?.trim() ?? "";

  if (!orderId) {
    return jsonError("Order id is required.", 400);
  }

  const [{ data: order, error: orderError }, { data: profile, error: profileError }] =
    await Promise.all([
      adminClient
        .from("orders")
        .select(
          "id, user_id, total, status, shipping_address, items, payment_reference, shipping_tier, created_at",
        )
        .eq("id", orderId)
        .maybeSingle<OrderRecord>(),
      adminClient
        .from("user_profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .maybeSingle<UserProfileRecord>(),
    ]);

  if (orderError) {
    console.error("Failed to load order for confirmation email.", orderError);
    return jsonError("Could not load this order for email.", 500);
  }

  if (!order || order.user_id !== user.id) {
    return jsonError("Order not found.", 404);
  }

  if (order.status !== "paid") {
    return jsonError("This order is not ready for a confirmation email yet.", 400);
  }

  if (profileError) {
    console.error("Failed to load user profile for order email.", profileError);
  }

  const recipientEmail = profile?.email?.trim() || user.email?.trim() || "";
  if (!recipientEmail) {
    return jsonError("This account does not have an email address yet.", 400);
  }

  const email = renderOrderConfirmationEmail({
    createdAt: order.created_at ?? null,
    customerEmail: recipientEmail,
    customerName: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    items: normalizeItems(order.items),
    orderId: order.id,
    paymentReference: order.payment_reference ?? null,
    shippingAddress: normalizeAddress(order.shipping_address),
    shippingTier: order.shipping_tier ?? null,
    totalAmount: Number(order.total ?? 0),
  });

  try {
    const result = await sendBrevoEmail({
      htmlContent: email.html,
      idempotencyKey: createBrevoIdempotencyKey(
        `order-confirmation:${order.id}:${order.payment_reference ?? "paid"}`,
      ),
      senderProfile: "order",
      subject: email.subject,
      tags: ["order-confirmation"],
      textContent: email.text,
      to: [
        {
          email: recipientEmail,
          name: profile?.full_name?.trim() || undefined,
        },
      ],
    });

    return NextResponse.json({
      message: "Order confirmation email sent.",
      sandbox: result.sandbox,
    });
  } catch (error) {
    console.error("Failed to send order confirmation email.", error);
    return jsonError(
      getErrorMessage(error, "Could not send the order confirmation email."),
      502,
    );
  }
}
