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
import { mapProductRecord, type ProductRecord, type StoreProduct } from "../../lib/commerce";

const STORE_CART_STORAGE_KEY = "nbe_store_cart_v1";

export interface StoreCartItem extends StoreProduct {
  quantity: number;
}

interface StoreCartContextValue {
  items: StoreCartItem[];
  distinctItemCount: number;
  totalQuantity: number;
  addItem: (product: StoreProduct, quantity?: number) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
}

type ShoppingCartRow = {
  id: string;
};

type ShoppingCartItemRow = {
  quantity: number;
  products: ProductRecord | ProductRecord[] | null;
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
    normalizeCartQuantity(item.quantity) > 0
  );
}

function sanitizeStoreCartItems(items: unknown[]) {
  const deduped = new Map<number, StoreCartItem>();

  for (const value of items) {
    if (!isStoreCartItem(value)) {
      continue;
    }

    const quantity = normalizeCartQuantity(value.quantity);
    if (quantity <= 0) {
      continue;
    }

    const existing = deduped.get(value.id);
    deduped.set(value.id, {
      ...value,
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

  const seenProductIds = new Set<number>();
  for (const rawItem of rawItems) {
    if (!isStoreCartItem(rawItem)) {
      return true;
    }

    const normalizedQuantity = normalizeCartQuantity(rawItem.quantity);
    if (normalizedQuantity !== rawItem.quantity) {
      return true;
    }

    if (seenProductIds.has(rawItem.id)) {
      return true;
    }

    seenProductIds.add(rawItem.id);
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
  const merged = new Map<number, StoreCartItem>();

  for (const item of serverItems) {
    merged.set(item.id, { ...item });
  }

  for (const item of localItems) {
    const existing = merged.get(item.id);
    if (existing) {
      merged.set(item.id, {
        ...existing,
        ...item,
        quantity: Math.max(existing.quantity, item.quantity),
      });
    } else {
      merged.set(item.id, { ...item });
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
    .select("quantity, products(*)")
    .eq("cart_id", cart.id);

  if (error) {
    throw error;
  }

  const items = ((itemRows as ShoppingCartItemRow[] | null) ?? [])
    .map((row) => {
      const productRecord = Array.isArray(row.products)
        ? row.products[0]
        : row.products;

      if (!productRecord) {
        return null;
      }

      return {
        ...mapProductRecord(productRecord),
        quantity: normalizeCartQuantity(row.quantity),
      } satisfies StoreCartItem;
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
    .upsert(
      items.map((item) => ({
        cart_id: resolvedCartId,
        product_id: item.id,
        quantity: item.quantity,
      })),
      { onConflict: "cart_id,product_id" },
    );

  if (insertError) {
    throw insertError;
  }

  return resolvedCartId;
}

export function StoreCartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
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
    if (!user || !hasSupabaseEnv || !remoteCartSupported) {
      setRemoteReady(false);
      cartIdRef.current = null;
      bootstrappedUserIdRef.current = user?.id ?? null;
      return;
    }

    try {
      syncInProgressRef.current = true;
      const localSnapshot = readLocalStoreCartSnapshot();
      const { cartId, items: remoteItems } = await loadRemoteCart(user.id);
      const mergedItems = localSnapshot.hasSnapshot
        ? localSnapshot.items
        : mergeCartItems(remoteItems, []);
      cartIdRef.current = await persistRemoteCart(user.id, cartId, mergedItems);
      setItems(mergedItems);
      setRemoteReady(true);
    } catch (error) {
      void error;
      disableRemoteCartSync();
    } finally {
      bootstrappedUserIdRef.current = user.id;
      syncInProgressRef.current = false;
    }
  }, [disableRemoteCartSync, remoteCartSupported, user]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!user) {
      cartIdRef.current = null;
      bootstrappedUserIdRef.current = null;
      queueMicrotask(() => {
        setRemoteReady(false);
      });
      return;
    }

    if (bootstrappedUserIdRef.current !== user.id) {
      void bootstrapRemoteCart();
    }
  }, [bootstrapRemoteCart, hydrated, user]);

  useEffect(() => {
    if (
      !hydrated ||
      !user ||
      !hasSupabaseEnv ||
      !remoteCartSupported ||
      !remoteReady ||
      syncInProgressRef.current
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      syncInProgressRef.current = true;

      void persistRemoteCart(user.id, cartIdRef.current, items)
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
  }, [disableRemoteCartSync, hydrated, items, remoteCartSupported, remoteReady, user]);

  const addItem = useCallback((product: StoreProduct, quantity = 1) => {
    setItems((currentItems) => {
      const nextQuantity = normalizeCartQuantity(quantity) || 1;
      const existingItem = currentItems.find((item) => item.id === product.id);

      if (existingItem) {
        return currentItems.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: normalizeCartQuantity(item.quantity + nextQuantity) || 1,
              }
            : item,
        );
      }

      return [...currentItems, { ...product, quantity: nextQuantity }];
    });
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((currentItems) =>
      currentItems.filter((item) => item.id !== productId),
    );
  }, []);

  const updateQuantity = useCallback((productId: number, quantity: number) => {
    const nextQuantity = normalizeCartQuantity(quantity);
    setItems((currentItems) =>
      currentItems
        .map((item) =>
          item.id === productId ? { ...item, quantity: nextQuantity } : item,
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
