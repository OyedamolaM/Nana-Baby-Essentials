"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  SEED_PRODUCTS,
  mapProductRecord,
  type ProductRecord,
  type StoreProduct,
} from "../../lib/commerce";
import { hasSupabaseEnv, supabase } from "../lib/supabase";

interface UsePaginatedProductsOptions {
  onlyInStock?: boolean;
  pageSize?: number;
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
  onlyInStock = false,
  pageSize = 16,
}: UsePaginatedProductsOptions = {}) {
  const [products, setProducts] = useState<StoreProduct[]>(
    onlyInStock ? SEED_PRODUCTS.filter((product) => product.inStock) : SEED_PRODUCTS,
  );
  const [loading, setLoading] = useState(hasSupabaseEnv);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(products.length);
  const [selectedCategory, setSelectedCategoryState] = useState<string>(
    CATEGORIES[0],
  );
  const [searchQuery, setSearchQueryState] = useState("");

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
    if (!hasSupabaseEnv) {
      const seedBase = onlyInStock
        ? SEED_PRODUCTS.filter((product) => product.inStock)
        : SEED_PRODUCTS;
      const filtered = filterSeedProducts(seedBase, selectedCategory, searchQuery);
      const offset = (page - 1) * pageSize;
      setProducts(filtered.slice(offset, offset + pageSize));
      setTotalCount(filtered.length);
      setLoading(false);
      return;
    }

    setLoading(true);

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

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);

    if (error || !data) {
      const seedBase = onlyInStock
        ? SEED_PRODUCTS.filter((product) => product.inStock)
        : SEED_PRODUCTS;
      const filtered = filterSeedProducts(seedBase, selectedCategory, searchQuery);
      setProducts(filtered.slice(from, to + 1));
      setTotalCount(filtered.length);
      setLoading(false);
      return;
    }

    setProducts((data as ProductRecord[]).map(mapProductRecord));
    setTotalCount(count ?? data.length);
    setLoading(false);
  }, [onlyInStock, page, pageSize, searchQuery, selectedCategory]);

  useEffect(() => {
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
  onlyInStock = false,
  limit = 4,
}: {
  onlyInStock?: boolean;
  limit?: number;
} = {}) {
  const [products, setProducts] = useState<StoreProduct[]>(
    (onlyInStock
      ? SEED_PRODUCTS.filter((product) => product.inStock)
      : SEED_PRODUCTS
    ).slice(0, limit),
  );

  useEffect(() => {
    if (!hasSupabaseEnv) {
      return;
    }

    const loadFeaturedProducts = async () => {
      let query = supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (onlyInStock) {
        query = query.eq("in_stock", true);
      }

      const { data, error } = await query;

      if (error || !data) {
        setProducts(
          (onlyInStock
            ? SEED_PRODUCTS.filter((product) => product.inStock)
            : SEED_PRODUCTS
          ).slice(0, limit),
        );
        return;
      }

      setProducts((data as ProductRecord[]).map(mapProductRecord));
    };

    void loadFeaturedProducts();
  }, [limit, onlyInStock]);

  return products;
}
