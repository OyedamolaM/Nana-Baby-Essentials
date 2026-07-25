"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import {
  hasSupabaseEnv,
  supabase,
} from "../lib/supabase";
import {
  mapProductRecord,
  PRODUCT_LIST_SELECT,
  type ProductRecord,
  type StoreProduct,
  type StoreProductVariant,
} from "../../lib/commerce";

const STORE_CART_STORAGE_KEY = "nbe_store_cart_v1";

export interface StoreCartItem extends StoreProduct {
  quantity: number;
  variantId?: string;
  size?: string;
  color?: string;
}

interface StoreCartContextValue {
  items: StoreCartItem[];
  distinctItemCount: number;
  totalQuantity: number;
  addItem: (
    product: StoreProduct,
    quantity?: number,
    variant?: StoreProductVariant,
  ) => boolean;
  removeItem: (itemKey: string) => void;
  updateQuantity: (itemKey: string, quantity: number) => void;
  clearCart: () => void;
}

type ShoppingCartRow = {
  id: string;
};

type ShoppingCartItemRow = {
  quantity: number;
  variant_id?: string | null;
  product_variants?: ShoppingCartVariantRow | ShoppingCartVariantRow[] | null;
  products: ProductRecord | ProductRecord[] | null;
};

type ShoppingCartVariantRow = {
  color?: string | null;
  id: string;
  in_stock?: boolean | null;
  price_override?: number | null;
  size?: string | null;
  stock_quantity?: number | null;
};

const StoreCartContext = createContext<StoreCartContextValue | undefined>(
  undefined,
);

function normalizeCartQuantity(quantity: unknown) {
  const normalizedQuantity = Math.floor(Number(quantity));

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    return 0;
  }

  return Math.min(normalizedQuantity, 9999);
}

function normalizeOptionalCartText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function getStoreCartItemKey(
  item: Pick<StoreCartItem, "id" | "variantId">,
) {
  return `${item.id}-${item.variantId?.trim() || "base"}`;
}

function isStoreCartItem(value: unknown): value is StoreCartItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<StoreCartItem>;
  return (
    typeof item.id === "number" &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    typeof item.category === "string" &&
    typeof item.image === "string" &&
    typeof item.description === "string" &&
    typeof item.inStock === "boolean" &&
    (item.variantId === undefined ||
      (typeof item.variantId === "string" && item.variantId.trim().length > 0)) &&
    (item.size === undefined || item.size === null || typeof item.size === "string") &&
    (item.color === undefined || item.color === null || typeof item.color === "string") &&
    normalizeCartQuantity(item.quantity) > 0
  );
}

function sanitizeStoreCartItems(items: unknown[]) {
  const deduped = new Map<string, StoreCartItem>();

  for (const value of items) {
    if (!isStoreCartItem(value)) {
      continue;
    }

    const quantity = normalizeCartQuantity(value.quantity);
    if (quantity <= 0) {
      continue;
    }

    const sanitizedItem = {
      ...value,
      color: normalizeOptionalCartText(value.color),
      size: normalizeOptionalCartText(value.size),
      variantId: normalizeOptionalCartText(value.variantId),
      quantity,
    } satisfies StoreCartItem;
    const existing = deduped.get(getStoreCartItemKey(sanitizedItem));
    deduped.set(getStoreCartItemKey(sanitizedItem), {
      ...sanitizedItem,
      quantity: existing
        ? Math.max(existing.quantity, quantity)
        : quantity,
    });
  }

  return Array.from(deduped.values());
}

function shouldResetCorruptedCartSnapshot(rawItems: unknown[], sanitizedItems: StoreCartItem[]) {
  if (sanitizedItems.length !== rawItems.length) {
    return true;
  }

  const seenItemKeys = new Set<string>();
  for (const rawItem of rawItems) {
    if (!isStoreCartItem(rawItem)) {
      return true;
    }

    const normalizedQuantity = normalizeCartQuantity(rawItem.quantity);
    if (normalizedQuantity !== rawItem.quantity) {
      return true;
    }

    const itemKey = getStoreCartItemKey(rawItem);
    if (seenItemKeys.has(itemKey)) {
      return true;
    }

    seenItemKeys.add(itemKey);
  }

  return false;
}

function readLocalStoreCart() {
  if (typeof window === "undefined") {
    return [] as StoreCartItem[];
  }

  try {
    const raw = window.localStorage.getItem(STORE_CART_STORAGE_KEY);
    if (!raw) {
      return [] as StoreCartItem[];
    }

    const parsed = JSON.parse(raw) as unknown[];
    return sanitizeStoreCartItems(parsed);
  } catch {
    return [] as StoreCartItem[];
  }
}

function readLocalStoreCartSnapshot() {
  if (typeof window === "undefined") {
    return {
      hasSnapshot: false,
      items: [] as StoreCartItem[],
    };
  }

  try {
    const raw = window.localStorage.getItem(STORE_CART_STORAGE_KEY);
    if (raw === null) {
      return {
        hasSnapshot: false,
        items: [] as StoreCartItem[],
      };
    }

    const parsed = JSON.parse(raw) as unknown[];
    const sanitizedItems = sanitizeStoreCartItems(parsed);
    if (shouldResetCorruptedCartSnapshot(parsed, sanitizedItems)) {
      window.localStorage.setItem(STORE_CART_STORAGE_KEY, JSON.stringify([]));
      return {
        hasSnapshot: true,
        items: [] as StoreCartItem[],
      };
    }

    return {
      hasSnapshot: true,
      items: sanitizedItems,
    };
  } catch {
    return {
      hasSnapshot: true,
      items: [] as StoreCartItem[],
    };
  }
}

function writeLocalStoreCart(items: StoreCartItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORE_CART_STORAGE_KEY, JSON.stringify(items));
}

function mergeCartItems(
  serverItems: StoreCartItem[],
  localItems: StoreCartItem[],
) {
  const merged = new Map<string, StoreCartItem>();

  for (const item of serverItems) {
    merged.set(getStoreCartItemKey(item), { ...item });
  }

  for (const item of localItems) {
    const itemKey = getStoreCartItemKey(item);
    const existing = merged.get(itemKey);
    if (existing) {
      merged.set(itemKey, {
        ...existing,
        ...item,
        quantity: Math.max(existing.quantity, item.quantity),
      });
    } else {
      merged.set(itemKey, { ...item });
    }
  }

  return Array.from(merged.values());
}

async function ensureRemoteCart(userId: string) {
  const { data: cart, error } = await supabase
    .from("shopping_carts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (cart) {
    return cart as ShoppingCartRow;
  }

  const { data: insertedCart, error: insertError } = await supabase
    .from("shopping_carts")
    .upsert({ user_id: userId }, { onConflict: "user_id" })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }

  return insertedCart as ShoppingCartRow;
}

async function loadRemoteCart(userId: string) {
  const cart = await ensureRemoteCart(userId);

  const { data: itemRows, error } = await supabase
    .from("shopping_cart_items")
    .select(
      `quantity, variant_id, products(${PRODUCT_LIST_SELECT}), product_variants(id, size, color, price_override, stock_quantity, in_stock)`,
    )
    .eq("cart_id", cart.id);

  if (error) {
    throw error;
  }

  const items = ((itemRows as ShoppingCartItemRow[] | null) ?? [])
    .map((row) => {
      const productRecord = Array.isArray(row.products)
        ? row.products[0]
        : row.products;
      const variantRecord = Array.isArray(row.product_variants)
        ? row.product_variants[0]
        : row.product_variants;

      if (!productRecord) {
        return null;
      }

      const product = mapProductRecord(productRecord);
      const variantId = normalizeOptionalCartText(row.variant_id) ?? variantRecord?.id;
      const variantPrice = Number(variantRecord?.price_override);
      const price =
        Number.isFinite(variantPrice) && variantRecord?.price_override !== null
          ? variantPrice
          : product.price;

      return {
        ...product,
        color: normalizeOptionalCartText(variantRecord?.color),
        price,
        sellingPrice: price,
        quantity: normalizeCartQuantity(row.quantity),
        size: normalizeOptionalCartText(variantRecord?.size),
        variantId,
      } as StoreCartItem;
    })
    .filter(
      (item): item is StoreCartItem =>
        Boolean(item) && (item?.quantity ?? 0) > 0,
    );

  return { cartId: cart.id, items };
}

async function persistRemoteCart(
  userId: string,
  cartId: string | null,
  items: StoreCartItem[],
) {
  const resolvedCartId = cartId ?? (await ensureRemoteCart(userId)).id;

  const { error: deleteError } = await supabase
    .from("shopping_cart_items")
    .delete()
    .eq("cart_id", resolvedCartId);

  if (deleteError) {
    throw deleteError;
  }

  if (items.length === 0) {
    return resolvedCartId;
  }

  const { error: insertError } = await supabase
    .from("shopping_cart_items")
    .insert(
      items.map((item) => ({
        cart_id: resolvedCartId,
        product_id: item.id,
        quantity: item.quantity,
        variant_id: item.variantId ?? null,
      })),
    );

  if (insertError) {
    throw insertError;
  }

  return resolvedCartId;
}

export function StoreCartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<StoreCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [remoteCartSupported, setRemoteCartSupported] = useState(hasSupabaseEnv);
  const [remoteReady, setRemoteReady] = useState(false);
  const cartIdRef = useRef<string | null>(null);
  const bootstrappedUserIdRef = useRef<string | null>(null);
  const syncInProgressRef = useRef(false);

  const disableRemoteCartSync = useCallback(() => {
    setRemoteCartSupported(false);
    setRemoteReady(false);
    cartIdRef.current = null;
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const localItems = sanitizeStoreCartItems(readLocalStoreCart());
      setItems(localItems);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    writeLocalStoreCart(items);
  }, [hydrated, items]);

  const bootstrapRemoteCart = useCallback(async () => {
    if (!userId || !hasSupabaseEnv || !remoteCartSupported) {
      setRemoteReady(false);
      cartIdRef.current = null;
      bootstrappedUserIdRef.current = userId;
      return;
    }

    try {
      syncInProgressRef.current = true;
      const localSnapshot = readLocalStoreCartSnapshot();
      const { cartId, items: remoteItems } = await loadRemoteCart(userId);
      const mergedItems = localSnapshot.hasSnapshot
        ? localSnapshot.items
        : mergeCartItems(remoteItems, []);
      cartIdRef.current = await persistRemoteCart(userId, cartId, mergedItems);
      setItems(mergedItems);
      setRemoteReady(true);
    } catch (error) {
      void error;
      disableRemoteCartSync();
    } finally {
      bootstrappedUserIdRef.current = userId;
      syncInProgressRef.current = false;
    }
  }, [disableRemoteCartSync, remoteCartSupported, userId]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!userId) {
      cartIdRef.current = null;
      bootstrappedUserIdRef.current = null;
      queueMicrotask(() => {
        setRemoteReady(false);
      });
      return;
    }

    if (bootstrappedUserIdRef.current !== userId) {
      void bootstrapRemoteCart();
    }
  }, [bootstrapRemoteCart, hydrated, userId]);

  useEffect(() => {
    if (
      !hydrated ||
      !userId ||
      !hasSupabaseEnv ||
      !remoteCartSupported ||
      !remoteReady ||
      syncInProgressRef.current
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      syncInProgressRef.current = true;

      void persistRemoteCart(userId, cartIdRef.current, items)
        .then((cartId) => {
          cartIdRef.current = cartId;
        })
        .catch((error) => {
          void error;
          disableRemoteCartSync();
        })
        .finally(() => {
          syncInProgressRef.current = false;
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [disableRemoteCartSync, hydrated, items, remoteCartSupported, remoteReady, userId]);

  const addItem = useCallback((product: StoreProduct, quantity = 1, variant?: StoreProductVariant) => {
    if (product.hasVariants && (!variant || !variant.id || !variant.inStock || variant.stockQuantity <= 0)) {
      return false;
    }

    if (!product.hasVariants && !product.inStock) {
      return false;
    }

    setItems((currentItems) => {
      const nextQuantity = normalizeCartQuantity(quantity) || 1;
      const variantId = variant?.id;
      const itemKey = getStoreCartItemKey({ id: product.id, variantId });
      const existingItem = currentItems.find(
        (item) => getStoreCartItemKey(item) === itemKey,
      );

      if (existingItem) {
        return currentItems.map((item) =>
          getStoreCartItemKey(item) === itemKey
            ? {
                ...item,
                quantity: normalizeCartQuantity(item.quantity + nextQuantity) || 1,
              }
            : item,
        );
      }

      const price = variant?.priceOverride ?? product.price;
      return [
        ...currentItems,
        {
          ...product,
          color: variant?.color,
          price,
          sellingPrice: price,
          quantity: nextQuantity,
          size: variant?.size,
          variantId,
        },
      ];
    });

    return true;
  }, []);

  const removeItem = useCallback((itemKey: string) => {
    setItems((currentItems) =>
      currentItems.filter((item) => getStoreCartItemKey(item) !== itemKey),
    );
  }, []);

  const updateQuantity = useCallback((itemKey: string, quantity: number) => {
    const nextQuantity = normalizeCartQuantity(quantity);
    setItems((currentItems) =>
      currentItems
        .map((item) =>
          getStoreCartItemKey(item) === itemKey
            ? { ...item, quantity: nextQuantity }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo<StoreCartContextValue>(
    () => ({
      items,
      distinctItemCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
    }),
    [addItem, clearCart, items, removeItem, updateQuantity],
  );

  return (
    <StoreCartContext.Provider value={value}>
      {children}
    </StoreCartContext.Provider>
  );
}

export function useStoreCart() {
  const context = useContext(StoreCartContext);

  if (!context) {
    throw new Error("useStoreCart must be used within StoreCartProvider.");
  }

  return context;
}
