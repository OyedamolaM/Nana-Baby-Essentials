"use client";

import { ArrowRight, Search } from "lucide-react";
import { useMemo, useRef } from "react";

import { type StoreProduct } from "../../../lib/commerce";
import { usePaginatedProducts } from "../../hooks/usePaginatedProducts";
import { CategoryFilter } from "../CategoryFilter";
import { ProductCard } from "../ProductCard";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../ui/pagination";

interface FeaturedCategoryTabsProps {
  initialProducts?: StoreProduct[];
  initialTotalCount?: number;
  onAddToCart: (product: StoreProduct, quantity?: number) => void;
  onViewAll?: () => void;
  onViewProduct: (product: StoreProduct) => void;
  addLabel?: string;
  categories?: string[];
  sectionId?: string;
  sectionTitle?: string;
  sectionSubtitle?: string;
}

function buildPagination(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages] as const;
}

function getVisibleRange(page: number, pageSize: number, totalCount: number) {
  if (totalCount <= 0) {
    return { start: 0, end: 0 };
  }

  return {
    start: (page - 1) * pageSize + 1,
    end: Math.min(page * pageSize, totalCount),
  };
}

function formatVisibleRangeLabel(
  start: number,
  end: number,
  totalCount: number,
  suffix: string,
) {
  const visibleLabel = start === end ? `${start}` : `${start}-${end}`;
  return `Showing ${visibleLabel} of ${totalCount} products${suffix}`;
}

export function FeaturedCategoryTabs({
  initialProducts,
  initialTotalCount,
  onAddToCart,
  onViewAll,
  onViewProduct,
  addLabel,
  categories,
  sectionId,
  sectionTitle = "Products",
  sectionSubtitle = "Browse the full product catalog by category, search what you need, and move through the catalog 12 items at a time.",
}: FeaturedCategoryTabsProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const {
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
  } = usePaginatedProducts({
    initialProducts,
    initialTotalCount,
    onlyInStock: false,
    pageSize: 12,
  });
  const paginationItems = useMemo(
    () => buildPagination(page, totalPages),
    [page, totalPages],
  );
  const visibleRange = useMemo(
    () => getVisibleRange(page, pageSize, totalCount),
    [page, pageSize, totalCount],
  );
  const availableCategories = categories?.length ? categories : ["All"];
  const showActiveFilters = searchQuery.trim() !== "" || selectedCategory !== "All";
  const rangeSuffix =
    selectedCategory !== "All" ? ` in ${selectedCategory}` : "";
  const visibleRangeLabel = useMemo(
    () =>
      formatVisibleRangeLabel(
        visibleRange.start,
        visibleRange.end,
        totalCount,
        rangeSuffix,
      ),
    [rangeSuffix, totalCount, visibleRange.end, visibleRange.start],
  );

  return (
    <section id={sectionId} className="section-spacing bg-white">
      <div className="container mx-auto px-4">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <div className="max-w-3xl">
            <h2 className="section-title">{sectionTitle}</h2>
            <p className="section-copy mt-3">{sectionSubtitle}</p>
          </div>
        </div>

        <div className="mx-auto mb-8 max-w-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search for products..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="py-6 pl-10 text-base sm:text-lg"
            />
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="min-w-0 md:flex-1">
            <CategoryFilter
              categories={availableCategories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />
          </div>

          {onViewAll ? (
            <div className="hidden md:flex md:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onViewAll}
                className="text-[14px] md:px-8 md:text-lg"
              >
                View All Products
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>

        {showActiveFilters ? (
          <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span>
              Active filters:
              {searchQuery ? ` search "${searchQuery}"` : ""}
              {searchQuery && selectedCategory !== "All" ? " and" : ""}
              {selectedCategory !== "All" ? ` category "${selectedCategory}"` : ""}
            </span>
            <button
              type="button"
              className="font-medium text-pink-600"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : null}

        {!loading && totalCount > 0 ? (
          <p className="mb-6 text-center text-sm leading-6 text-gray-600 md:text-left">
            {visibleRangeLabel}
          </p>
        ) : null}

        {loading ? (
          <div className="py-16 text-center">
            <p className="text-xl text-gray-500">Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-xl text-gray-500">
              No products found. Try a different search or category.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  addLabel={addLabel}
                  onAddToCart={onAddToCart}
                  onViewDetails={onViewProduct}
                />
              ))}
            </div>

            <Pagination className="mt-10">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={sectionId ? `#${sectionId}` : "#"}
                    onClick={(event) => {
                      event.preventDefault();
                      if (page > 1) {
                        setPage(page - 1);
                      }
                    }}
                    aria-disabled={page === 1}
                    className={page === 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>

                {paginationItems.map((item, index) => (
                  <PaginationItem key={`${item}-${index}`}>
                    {item === "ellipsis" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        href={sectionId ? `#${sectionId}` : "#"}
                        isActive={item === page}
                        onClick={(event) => {
                          event.preventDefault();
                          setPage(Number(item));
                        }}
                      >
                        {item}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    href={sectionId ? `#${sectionId}` : "#"}
                    onClick={(event) => {
                      event.preventDefault();
                      if (page < totalPages) {
                        setPage(page + 1);
                      }
                    }}
                    aria-disabled={page === totalPages}
                    className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </>
        )}

        {onViewAll ? (
          <div className="mt-8 flex justify-center md:hidden">
            <Button type="button" variant="outline" onClick={onViewAll} className="text-[14px]">
              View All Products
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
