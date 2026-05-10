"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  SEED_PRODUCTS,
  mapProductRecord,
  type ProductRecord,
  type StoreProduct,
} from "../../lib/commerce";
import {
  extractAssignedCategoryLabel,
  normalizeProductCategoryLabels,
  type ProductCategoryAssignmentRecord,
} from "../../lib/productCategories";
import { hasSupabaseEnv, supabase } from "../lib/supabase";

interface UsePaginatedProductsOptions {
  featuredOnly?: boolean;
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
  featuredOnly,
  onlyInStock,
  page,
  pageSize,
  searchQuery,
  selectedCategory,
}: {
  featuredOnly: boolean;
  onlyInStock: boolean;
  page: number;
  pageSize: number;
  searchQuery: string;
  selectedCategory: string;
}) {
  return JSON.stringify({
    featuredOnly,
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
  featuredOnly: boolean,
  selectedCategory: string,
  searchQuery: string,
) {
  return products.filter((product) => {
    const matchesFeatured = !featuredOnly || product.isFeatured;
    const matchesCategory =
      selectedCategory === "All" ||
      normalizeProductCategoryLabels(product.category, product.categories).includes(
        selectedCategory,
      );
    const matchesSearch =
      searchQuery.trim() === "" ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFeatured && matchesCategory && matchesSearch;
  });
}

function applyProductCategoryAssignments(
  records: ProductRecord[],
  assignments: ProductCategoryAssignmentRecord[],
) {
  const assignmentsByProductId = assignments.reduce<Record<number, string[]>>(
    (accumulator, assignment) => {
      const label = extractAssignedCategoryLabel(assignment);
      if (!label) {
        return accumulator;
      }

      const productId = Number(assignment.product_id);
      const existing = accumulator[productId] ?? [];
      existing.push(label);
      accumulator[productId] = existing;
      return accumulator;
    },
    {},
  );

  return records.map((record) => ({
    ...record,
    categories: normalizeProductCategoryLabels(
      record.category,
      assignmentsByProductId[Number(record.id)],
    ),
  }));
}

async function getProductCategoryAssignmentsForProducts(productIds: number[]) {
  if (productIds.length === 0) {
    return [] as ProductCategoryAssignmentRecord[];
  }

  const { data, error } = await supabase
    .from("product_category_assignments")
    .select("product_id, category_id, product_categories(label, sort_order, is_active)")
    .in("product_id", productIds);

  if (error?.code === "42P01") {
    return [] as ProductCategoryAssignmentRecord[];
  }

  if (error || !data) {
    return [] as ProductCategoryAssignmentRecord[];
  }

  return data as ProductCategoryAssignmentRecord[];
}

async function getProductIdsForSelectedCategory(selectedCategory: string) {
  const { data: categoryRows, error: categoryError } = await supabase
    .from("product_categories")
    .select("id")
    .eq("label", selectedCategory)
    .limit(1);

  if (categoryError?.code === "42P01") {
    return null as number[] | null;
  }

  if (categoryError || !categoryRows?.length) {
    return [] as number[];
  }

  const categoryId = categoryRows[0]?.id;
  if (!categoryId) {
    return [] as number[];
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("product_category_assignments")
    .select("product_id")
    .eq("category_id", categoryId);

  if (assignmentError?.code === "42P01") {
    return null;
  }

  if (assignmentError || !assignmentRows) {
    return [] as number[];
  }

  return Array.from(
    new Set(
      assignmentRows
        .map((assignment) => Number(assignment.product_id))
        .filter((productId) => Number.isFinite(productId)),
    ),
  );
}

export function usePaginatedProducts({
  featuredOnly = false,
  initialPage = 1,
  initialProducts,
  initialSearchQuery = "",
  initialSelectedCategory = CATEGORIES[0],
  initialTotalCount,
  onlyInStock = false,
  pageSize = 20,
}: UsePaginatedProductsOptions = {}) {
  const fallbackProducts = onlyInStock
    ? SEED_PRODUCTS.filter((product) => product.inStock)
    : SEED_PRODUCTS;
  const hasInitialResult =
    Array.isArray(initialProducts) && typeof initialTotalCount === "number";
  const initialCacheKey = getPaginatedProductsCacheKey({
    featuredOnly,
    onlyInStock,
    page: initialPage,
    pageSize,
    searchQuery: initialSearchQuery,
    selectedCategory: initialSelectedCategory,
  });
  const initialCachedResult =
    !hasInitialResult && hasSupabaseEnv
      ? readPaginatedProductsCache(initialCacheKey)
      : undefined;
  const [products, setProducts] = useState<StoreProduct[]>(
    Array.isArray(initialProducts)
      ? initialProducts
      : initialCachedResult?.products ?? fallbackProducts,
  );
  const [loading, setLoading] = useState(
    Boolean(hasSupabaseEnv && !hasInitialResult && !initialCachedResult),
  );
  const [page, setPage] = useState(initialPage);
  const [totalCount, setTotalCount] = useState(
    typeof initialTotalCount === "number"
      ? initialTotalCount
      : (initialCachedResult?.totalCount ??
        initialProducts?.length ??
        fallbackProducts.length),
  );
  const [selectedCategory, setSelectedCategoryState] = useState<string>(
    initialSelectedCategory,
  );
  const [searchQuery, setSearchQueryState] = useState(initialSearchQuery);
  const skipInitialFetchRef = useRef(
    hasInitialResult || Boolean(initialCachedResult),
  );

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
      featuredOnly,
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
      const filtered = filterSeedProducts(
        seedBase,
        featuredOnly,
        selectedCategory,
        searchQuery,
      );
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

    if (featuredOnly) {
      query = query.eq("is_featured", true);
    }

    if (selectedCategory !== "All") {
      const matchingProductIds = await getProductIdsForSelectedCategory(selectedCategory);

      if (matchingProductIds === null) {
        query = query.eq("category", selectedCategory);
      } else if (matchingProductIds.length === 0) {
        setProducts([]);
        setTotalCount(0);
        persistPaginatedProductsCache(cacheKey, {
          page,
          products: [],
          totalCount: 0,
        });
        setLoading(false);
        return;
      } else {
        query = query.in("id", matchingProductIds);
      }
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
      const filtered = filterSeedProducts(
        seedBase,
        featuredOnly,
        selectedCategory,
        searchQuery,
      );
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

    const productRows = data as ProductRecord[];
    const assignments = await getProductCategoryAssignmentsForProducts(
      productRows.map((product) => Number(product.id)),
    );
    const nextProducts = applyProductCategoryAssignments(productRows, assignments).map(
      mapProductRecord,
    );
    const nextTotalCount = count ?? data.length;
    setProducts(nextProducts);
    setTotalCount(nextTotalCount);
    persistPaginatedProductsCache(cacheKey, {
      page,
      products: nextProducts,
      totalCount: nextTotalCount,
    });
    setLoading(false);
  }, [featuredOnly, onlyInStock, page, pageSize, searchQuery, selectedCategory]);

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
      featuredOnly,
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
  }, [featuredOnly, onlyInStock, page, pageSize, products, searchQuery, selectedCategory, totalCount]);

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
