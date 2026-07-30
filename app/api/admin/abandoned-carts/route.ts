import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const ABANDONED_AFTER_MINUTES = 30;
const ABANDONED_CART_LIMIT = 100;

type CartRow = {
  created_at: string;
  id: string;
  updated_at: string;
  user_id: string;
};

type CartProductRow = {
  id: number;
  name: string;
  price?: number | null;
  selling_price?: number | null;
};

type CartVariantRow = {
  color?: string | null;
  price_override?: number | null;
  size?: string | null;
};

type CartItemRow = {
  cart_id: string;
  product_variants?: CartVariantRow | CartVariantRow[] | null;
  products?: CartProductRow | CartProductRow[] | null;
  quantity: number;
  variant_id?: string | null;
};

type ProfileRow = {
  email?: string | null;
  full_name?: string | null;
  id: string;
  phone?: string | null;
};

function firstRelation<T>(value?: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function GET(request: Request) {
  const admin = await requireAdminRoute(request);
  if (admin.response) {
    return admin.response;
  }

  const client = createSupabaseServiceRoleClient();
  if (!client) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const cutoff = new Date(
    Date.now() - ABANDONED_AFTER_MINUTES * 60 * 1000,
  ).toISOString();
  const { data: cartData, error: cartError } = await client
    .from("shopping_carts")
    .select("id, user_id, created_at, updated_at")
    .lte("updated_at", cutoff)
    .order("updated_at", { ascending: false })
    .limit(ABANDONED_CART_LIMIT);

  if (cartError) {
    return NextResponse.json(
      { message: cartError.message || "Could not load abandoned carts." },
      { status: 500 },
    );
  }

  const carts = (cartData ?? []) as CartRow[];
  if (carts.length === 0) {
    return NextResponse.json({
      abandonedAfterMinutes: ABANDONED_AFTER_MINUTES,
      carts: [],
    });
  }

  const cartIds = carts.map((cart) => cart.id);
  const userIds = [...new Set(carts.map((cart) => cart.user_id))];
  const [{ data: itemData, error: itemError }, { data: profileData, error: profileError }] =
    await Promise.all([
      client
        .from("shopping_cart_items")
        .select(
          "cart_id, quantity, variant_id, products(id, name, price, selling_price), product_variants(size, color, price_override)",
        )
        .in("cart_id", cartIds),
      client
        .from("user_profiles")
        .select("id, full_name, email, phone")
        .in("id", userIds),
    ]);

  if (itemError || profileError) {
    return NextResponse.json(
      {
        message:
          itemError?.message ||
          profileError?.message ||
          "Could not load abandoned cart details.",
      },
      { status: 500 },
    );
  }

  const profiles = Object.fromEntries(
    ((profileData ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );
  const itemsByCart = ((itemData ?? []) as CartItemRow[]).reduce<
    Record<string, CartItemRow[]>
  >((result, item) => {
    (result[item.cart_id] ??= []).push(item);
    return result;
  }, {});

  const abandonedCarts = carts.flatMap((cart) => {
    const cartItems = itemsByCart[cart.id] ?? [];
    if (cartItems.length === 0) {
      return [];
    }

    const profile = profiles[cart.user_id];
    return [
      {
        createdAt: cart.created_at,
        customer: {
          email: profile?.email ?? null,
          name: profile?.full_name ?? null,
          phone: profile?.phone ?? null,
        },
        id: cart.id,
        items: cartItems.map((item) => {
          const product = firstRelation(item.products);
          const variant = firstRelation(item.product_variants);
          return {
            color: variant?.color ?? null,
            name: product?.name ?? "Unavailable product",
            productId: product?.id ?? null,
            quantity: Math.max(1, Number(item.quantity ?? 1)),
            size: variant?.size ?? null,
            unitPrice: Number(
              variant?.price_override ??
                product?.selling_price ??
                product?.price ??
                0,
            ),
            variantId: item.variant_id ?? null,
          };
        }),
        updatedAt: cart.updated_at,
        userId: cart.user_id,
      },
    ];
  });

  return NextResponse.json({
    abandonedAfterMinutes: ABANDONED_AFTER_MINUTES,
    carts: abandonedCarts,
  });
}
