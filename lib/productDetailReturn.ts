import type { StoreProduct } from "./commerce";

const PRODUCT_DETAIL_RETURN_KEY = "nbe:product-detail-return";

export type ProductDetailReturnContext = {
  originPath: string;
  product: StoreProduct;
  scrollY?: number;
  catalogState?: { page: number; category: string; search: string };
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
    const catalog = document.querySelector<HTMLElement>("[data-product-catalog]");
    window.sessionStorage.setItem(PRODUCT_DETAIL_RETURN_KEY, JSON.stringify({
      ...context,
      scrollY: window.scrollY,
      catalogState: catalog ? { page: Number(catalog.dataset.catalogPage ?? 1), category: catalog.dataset.catalogCategory ?? "All", search: catalog.dataset.catalogSearch ?? "" } : undefined,
    }));
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
