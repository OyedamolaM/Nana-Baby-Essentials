import type { StoreProduct } from "./commerce";

const PRODUCT_DETAIL_RETURN_KEY = "nbe:product-detail-return";

export type ProductDetailReturnContext = {
  originPath: string;
  product: StoreProduct;
};

export function getCurrentProductReturnPath() {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function readProductDetailReturnContext() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(PRODUCT_DETAIL_RETURN_KEY);
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as ProductDetailReturnContext;
  } catch {
    return null;
  }
}

export function persistProductDetailReturnContext(context: ProductDetailReturnContext) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(PRODUCT_DETAIL_RETURN_KEY, JSON.stringify(context));
  } catch {
    // Ignore storage failures and keep navigation working.
  }
}

export function clearProductDetailReturnContext() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(PRODUCT_DETAIL_RETURN_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}
