import { type StoreProduct } from "./commerce";

export interface RegistryCartItem {
  product: StoreProduct;
  quantity: number;
}

const REGISTRY_CART_STORAGE_KEY = "nbe_registry_cart_v1";

function isRegistryCartItem(value: unknown): value is RegistryCartItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<RegistryCartItem>;
  return (
    typeof item.quantity === "number" &&
    Boolean(item.product) &&
    typeof item.product === "object" &&
    typeof item.product.id === "number" &&
    typeof item.product.name === "string" &&
    typeof item.product.slug === "string"
  );
}

export function readRegistryCart() {
  if (typeof window === "undefined") {
    return [] as RegistryCartItem[];
  }

  try {
    const raw = window.localStorage.getItem(REGISTRY_CART_STORAGE_KEY);
    if (!raw) {
      return [] as RegistryCartItem[];
    }

    const parsed = JSON.parse(raw) as unknown[];
    return parsed.filter(isRegistryCartItem);
  } catch {
    return [] as RegistryCartItem[];
  }
}

export function writeRegistryCart(items: RegistryCartItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(REGISTRY_CART_STORAGE_KEY, JSON.stringify(items));
}

export function clearRegistryCart() {
  writeRegistryCart([]);
}

export function addRegistryCartItem(product: StoreProduct, quantity = 1) {
  const existingItems = readRegistryCart();
  const nextItems = [...existingItems];
  const matchingIndex = nextItems.findIndex((item) => item.product.id === product.id);

  if (matchingIndex >= 0) {
    nextItems[matchingIndex] = {
      ...nextItems[matchingIndex],
      quantity: nextItems[matchingIndex].quantity + quantity,
      product,
    };
  } else {
    nextItems.push({
      product,
      quantity,
    });
  }

  writeRegistryCart(nextItems);
  return nextItems;
}

export function updateRegistryCartQuantity(productId: number, quantity: number) {
  const nextItems = readRegistryCart()
    .map((item) =>
      item.product.id === productId
        ? { ...item, quantity: Math.max(0, Math.floor(quantity)) }
        : item,
    )
    .filter((item) => item.quantity > 0);

  writeRegistryCart(nextItems);
  return nextItems;
}

export function removeRegistryCartItem(productId: number) {
  const nextItems = readRegistryCart().filter((item) => item.product.id !== productId);
  writeRegistryCart(nextItems);
  return nextItems;
}
