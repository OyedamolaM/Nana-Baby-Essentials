"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  SEED_PRODUCTS,
  mapProductRecord,
  type ProductRecord,
  type StoreProduct,
} from "../../lib/commerce";
import { hasSupabaseEnv, supabase } from "../lib/supabase";

interface UsePaginatedProductsOptions {
  initialPage?: number;
  initialProducts?: StoreProduct[];
  initialSearchQuery?: string;
  initialSelectedCategory?: string;
  initialTotalCount?: number;
  onlyInStock?: boolean;
  pageSize?: number;
}

type PaginatedProductsCacheEntry = {
  page: number;
  products: StoreProduct[];
  totalCount: number;
};

const PAGINATED_PRODUCTS_CACHE_STORAGE_PREFIX = "nbe:product-page:";
const paginatedProductsCache = new Map<string, PaginatedProductsCacheEntry>();

function getPaginatedProductsCacheKey({
  onlyInStock,
  page,
  pageSize,
  searchQuery,
  selectedCategory,
}: {
  onlyInStock: boolean;
  page: number;
  pageSize: number;
  searchQuery: string;
  selectedCategory: string;
}) {
  return JSON.stringify({
    onlyInStock,
    page,
    pageSize,
    searchQuery: searchQuery.trim().toLowerCase(),
    selectedCategory,
  });
}

function readPaginatedProductsCache(cacheKey: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const memoryEntry = paginatedProductsCache.get(cacheKey);
  if (memoryEntry) {
    return memoryEntry;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      `${PAGINATED_PRODUCTS_CACHE_STORAGE_PREFIX}${cacheKey}`,
    );
    if (!rawValue) {
      return undefined;
    }

    const parsed = JSON.parse(rawValue) as PaginatedProductsCacheEntry;
    paginatedProductsCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function persistPaginatedProductsCache(
  cacheKey: string,
  entry: PaginatedProductsCacheEntry,
) {
  paginatedProductsCache.set(cacheKey, entry);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${PAGINATED_PRODUCTS_CACHE_STORAGE_PREFIX}${cacheKey}`,
      JSON.stringify(entry),
    );
  } catch {
    // Ignore storage failures and keep the in-memory cache.
  }
}

function filterSeedProducts(
  products: StoreProduct[],
  selectedCategory: string,
  searchQuery: string,
) {
  return products.filter((product) => {
    const matchesCategory =
      selectedCategory === "All" || product.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === "" ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });
}

export function usePaginatedProducts({
  initialPage = 1,
  initialProducts,
  initialSearchQuery = "",
  initialSelectedCategory = CATEGORIES[0],
  initialTotalCount,
  onlyInStock = false,
  pageSize = 16,
}: UsePaginatedProductsOptions = {}) {
  const fallbackProducts = onlyInStock
    ? SEED_PRODUCTS.filter((product) => product.inStock)
    : SEED_PRODUCTS;
  const hasInitialResult =
    Array.isArray(initialProducts) && typeof initialTotalCount === "number";
  const [products, setProducts] = useState<StoreProduct[]>(
    Array.isArray(initialProducts) ? initialProducts : fallbackProducts,
  );
  const [loading, setLoading] = useState(
    Boolean(hasSupabaseEnv && !hasInitialResult),
  );
  const [page, setPage] = useState(initialPage);
  const [totalCount, setTotalCount] = useState(
    typeof initialTotalCount === "number"
      ? initialTotalCount
      : (initialProducts?.length ?? fallbackProducts.length),
  );
  const [selectedCategory, setSelectedCategoryState] = useState<string>(
    initialSelectedCategory,
  );
  const [searchQuery, setSearchQueryState] = useState(initialSearchQuery);
  const skipInitialFetchRef = useRef(hasInitialResult);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [pageSize, totalCount],
  );

  const setSelectedCategory = useCallback((category: string) => {
    setSelectedCategoryState(category);
    setPage(1);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    setPage(1);
  }, []);

  const loadProducts = useCallback(async () => {
    const cacheKey = getPaginatedProductsCacheKey({
      onlyInStock,
      page,
      pageSize,
      searchQuery,
      selectedCategory,
    });
    const cachedResult = readPaginatedProductsCache(cacheKey);

    if (cachedResult) {
      setProducts(cachedResult.products);
      setTotalCount(cachedResult.totalCount);
      setLoading(false);
    }

    if (!hasSupabaseEnv) {
      const seedBase = onlyInStock
        ? SEED_PRODUCTS.filter((product) => product.inStock)
        : SEED_PRODUCTS;
      const filtered = filterSeedProducts(seedBase, selectedCategory, searchQuery);
      const offset = (page - 1) * pageSize;
      const nextProducts = filtered.slice(offset, offset + pageSize);
      setProducts(nextProducts);
      setTotalCount(filtered.length);
      persistPaginatedProductsCache(cacheKey, {
        page,
        products: nextProducts,
        totalCount: filtered.length,
      });
      setLoading(false);
      return;
    }

    setLoading(!cachedResult);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (onlyInStock) {
      query = query.eq("in_stock", true);
    }

    if (selectedCategory !== "All") {
      query = query.eq("category", selectedCategory);
    }

    if (searchQuery.trim()) {
      const escaped = searchQuery.trim().replace(/,/g, " ");
      query = query.or(
        `name.ilike.%${escaped}%,description.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await query.range(from, to);

    if (error || !data) {
      const seedBase = onlyInStock
        ? SEED_PRODUCTS.filter((product) => product.inStock)
        : SEED_PRODUCTS;
      const filtered = filterSeedProducts(seedBase, selectedCategory, searchQuery);
      const nextProducts = filtered.slice(from, to + 1);
      setProducts(nextProducts);
      setTotalCount(filtered.length);
      persistPaginatedProductsCache(cacheKey, {
        page,
        products: nextProducts,
        totalCount: filtered.length,
      });
      setLoading(false);
      return;
    }

    const nextProducts = (data as ProductRecord[]).map(mapProductRecord);
    const nextTotalCount = count ?? data.length;
    setProducts(nextProducts);
    setTotalCount(nextTotalCount);
    persistPaginatedProductsCache(cacheKey, {
      page,
      products: nextProducts,
      totalCount: nextTotalCount,
    });
    setLoading(false);
  }, [onlyInStock, page, pageSize, searchQuery, selectedCategory]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      setLoading(false);
      return;
    }

    queueMicrotask(() => {
      void loadProducts();
    });
  }, [loadProducts]);

  useEffect(() => {
    if (page > totalPages) {
      queueMicrotask(() => {
        setPage(totalPages);
      });
    }
  }, [page, totalPages]);

  useEffect(() => {
    const cacheKey = getPaginatedProductsCacheKey({
      onlyInStock,
      page,
      pageSize,
      searchQuery,
      selectedCategory,
    });

    persistPaginatedProductsCache(cacheKey, {
      page,
      products,
      totalCount,
    });
  }, [onlyInStock, page, pageSize, products, searchQuery, selectedCategory, totalCount]);

  return {
    loading,
    page,
    pageSize,
    products,
    searchQuery,
    selectedCategory,
    setPage,
    setSearchQuery,
    setSelectedCategory,
    totalCount,
    totalPages,
  };
}

export function useFeaturedProducts({
  initialProducts,
  onlyInStock = false,
  limit = 4,
}: {
  initialProducts?: StoreProduct[];
  onlyInStock?: boolean;
  limit?: number;
} = {}) {
  const fallbackFeaturedProducts = useMemo(
    () =>
      (onlyInStock
        ? SEED_PRODUCTS.filter((product) => product.inStock)
        : SEED_PRODUCTS
      )
        .filter((product) => product.isFeatured)
        .sort((left, right) => left.featuredSortOrder - right.featuredSortOrder)
        .slice(0, limit),
    [limit, onlyInStock],
  );

  const [products, setProducts] = useState<StoreProduct[]>(
    Array.isArray(initialProducts) ? initialProducts : fallbackFeaturedProducts,
  );

  useEffect(() => {
    if (Array.isArray(initialProducts)) {
      return;
    }

    if (!hasSupabaseEnv) {
      return;
    }

    const loadFeaturedProducts = async () => {
      let query = supabase
        .from("products")
        .select("*")
        .eq("is_featured", true)
        .order("featured_sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (onlyInStock) {
        query = query.eq("in_stock", true);
      }

      const { data, error } = await query;

      if (error || !data) {
        setProducts(fallbackFeaturedProducts);
        return;
      }

      setProducts((data as ProductRecord[]).map(mapProductRecord));
    };

    void loadFeaturedProducts();
  }, [fallbackFeaturedProducts, initialProducts, limit, onlyInStock]);

  return products;
}
