"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { CategoryFilter } from "../components/CategoryFilter";
import { ProductCard, type Product } from "../components/ProductCard";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { ShoppingCartDrawer } from "../components/ShoppingCartDrawer";
import { AuthModal } from "../components/auth/AuthModal";
import { CheckoutModal } from "../components/checkout/CheckoutModal";
import { useAuth } from "../contexts/AuthContext";
import { useStoreCart } from "../contexts/StoreCartContext";
import { usePaginatedProducts } from "../hooks/usePaginatedProducts";
import { type StoreProduct, type StoreProductVariant } from "../../lib/commerce";
import {
  clearProductDetailReturnContext,
  getCurrentProductReturnPath,
  readProductDetailReturnContext,
} from "../../lib/productDetailReturn";
import { Input } from "../components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../components/ui/pagination";

type AuthTab = "login" | "signup";

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

interface ProductsPageProps {
  initialFeaturedOnly?: boolean;
  initialFocusSearch?: boolean;
  initialCategories?: string[];
  initialProducts?: StoreProduct[];
  initialSearchQuery?: string;
  initialSelectedCategory?: string;
  initialTotalCount?: number;
  initialView?: "all" | "best-sellers" | "new-arrivals";
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

export function ProductsPage({
  initialFeaturedOnly = false,
  initialFocusSearch = false,
  initialCategories,
  initialProducts,
  initialSearchQuery = "",
  initialSelectedCategory = "All",
  initialTotalCount,
  initialView = "all",
}: ProductsPageProps) {
  const router = useRouter();
  const { isAdmin, signOut, user } = useAuth();
  const {
    items: cartItems,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    distinctItemCount,
  } = useStoreCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState<AuthTab>("login");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const productResultsRef = useRef<HTMLDivElement | null>(null);
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
    featuredOnly: initialFeaturedOnly,
    pageSize: 10,
    initialProducts,
    initialSearchQuery,
    initialSelectedCategory,
    initialTotalCount,
  });
  const pendingPaginationScrollRef = useRef<{
    page: number;
    previousProducts: Product[];
  } | null>(null);

  const paginationItems = buildPagination(page, totalPages);
  const visibleRange = getVisibleRange(page, pageSize, totalCount);
  const rangeSuffix =
    selectedCategory !== "All" ? ` in ${selectedCategory}` : "";
  const visibleRangeLabel = formatVisibleRangeLabel(
    visibleRange.start,
    visibleRange.end,
    totalCount,
    rangeSuffix,
  );

  const changePage = (nextPage: number) => {
    if (nextPage === page || nextPage < 1 || nextPage > totalPages) {
      return;
    }

    pendingPaginationScrollRef.current = {
      page: nextPage,
      previousProducts: products,
    };
    setPage(nextPage);
  };

  useEffect(() => {
    const pendingScroll = pendingPaginationScrollRef.current;
    if (
      !pendingScroll ||
      pendingScroll.page !== page ||
      loading ||
      pendingScroll.previousProducts === products
    ) {
      return;
    }

    let settledFrameId: number | null = null;
    const layoutFrameId = window.requestAnimationFrame(() => {
      settledFrameId = window.requestAnimationFrame(() => {
        const resultsElement = productResultsRef.current;
        if (!resultsElement) {
          return;
        }

        pendingPaginationScrollRef.current = null;
        const headerOffset = 96;
        const sectionTop = resultsElement.getBoundingClientRect().top + window.scrollY - headerOffset;
        window.scrollTo({ behavior: "smooth", top: Math.max(0, sectionTop) });
      });
    });

    return () => {
      window.cancelAnimationFrame(layoutFrameId);
      if (settledFrameId !== null) {
        window.cancelAnimationFrame(settledFrameId);
      }
    };
  }, [loading, page, products]);

  useEffect(() => {
    const reopenContext = readProductDetailReturnContext();
    if (!reopenContext || reopenContext.originPath !== getCurrentProductReturnPath()) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setSelectedProduct(reopenContext.product);
      setProductDetailOpen(true);
      clearProductDetailReturnContext();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (!initialFocusSearch) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [initialFocusSearch]);

  const openAuth = (tab: AuthTab) => {
    setAuthDefaultTab(tab);
    setAuthOpen(true);
  };

  const handleAddToCart = (product: Product, quantity = 1, variant?: StoreProductVariant) => {
    addItem(product, quantity, variant);
    toast.success(
      quantity > 1
        ? `${quantity} ${product.name} items added to cart.`
        : `${product.name} added to cart.`,
    );
  };

  const handleRemoveItem = (itemKey: string) => {
    removeItem(itemKey);
    toast.info("Item removed from cart.");
  };

  const handleUpdateQuantity = (itemKey: string, quantity: number) => {
    updateQuantity(itemKey, quantity);
  };

  const handleNavigate = (section: "home" | "products" | "about" | "faq") => {
    if (section === "home") {
      router.push("/");
      return;
    }

    if (section === "products") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    router.push(`/#${section}`);
  };

  const handleViewProduct = (product: Product) => {
    setSelectedProduct(product);
    setProductDetailOpen(true);
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      toast.info("Your cart is empty.");
      return;
    }

    if (!user) {
      toast.info("Please sign in to continue to checkout.");
      openAuth("login");
      return;
    }

    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const handleOpenDashboard = () => {
    if (!user) {
      openAuth("login");
      return;
    }

    router.push("/dashboard");
  };

  const handleOpenAdmin = () => {
    if (!user) {
      openAuth("login");
      return;
    }

    if (!isAdmin) {
      toast.error("Admin access is not enabled for this account.");
      return;
    }

    router.push("/admin");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out.");
    router.push("/");
  };

  const activeViewLabel = initialFeaturedOnly
    ? "best sellers"
    : initialView === "new-arrivals"
      ? "new arrivals"
      : null;
  const pageHeading = searchQuery
    ? `Search Results for "${searchQuery}"`
    : selectedCategory !== "All"
      ? selectedCategory
      : initialFeaturedOnly
        ? "Best Sellers"
        : initialView === "new-arrivals"
          ? "New Arrivals"
          : "All Products";
  const pageDescription = searchQuery
    ? `${totalCount} products found`
    : selectedCategory !== "All"
      ? `Browse ${selectedCategory.toLowerCase()} products from Nana's Baby Essentials.`
      : initialFeaturedOnly
        ? "Shop customer-favorite and featured baby essentials in one place."
        : initialView === "new-arrivals"
          ? "Browse the latest products added to the Nana's Baby Essentials catalog."
          : "Browse the full Nana's Baby Essentials catalog with search, category filters, and pagination.";

  const clearFilters = () => {
    if (initialFeaturedOnly || initialView !== "all") {
      router.push("/products");
      return;
    }

    setSearchQuery("");
    setSelectedCategory("All");
  };

  return (
    <div className="min-h-screen bg-white">
      <Header
        cartItemCount={distinctItemCount}
        isAuthenticated={Boolean(user)}
        isAdmin={isAdmin}
        onCartClick={() => setCartOpen(true)}
        onNavigate={handleNavigate}
        onSignIn={() => openAuth("login")}
        onSignUp={() => openAuth("signup")}
        onOpenDashboard={handleOpenDashboard}
        onOpenAdmin={handleOpenAdmin}
        onSignOut={handleSignOut}
      />

      <main>
        <section className="bg-gradient-to-b from-white to-gray-50 py-16 sm:py-20">
          <div className="container mx-auto px-4">
            <div className="mb-10 text-center">
              <h1 className="section-title mb-2">
                {pageHeading}
              </h1>
              <p className="section-copy mx-auto max-w-2xl">
                {pageDescription}
              </p>
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

            <CategoryFilter
              categories={initialCategories?.length ? initialCategories : ["All"]}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />

            {(searchQuery || selectedCategory !== "All") && (
              <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <span>
                  Active filters:
                  {activeViewLabel ? ` ${activeViewLabel}` : ""}
                  {activeViewLabel && (searchQuery || selectedCategory !== "All") ? "," : ""}
                  {searchQuery ? ` search "${searchQuery}"` : ""}
                  {searchQuery && selectedCategory !== "All" ? " and" : ""}
                  {selectedCategory !== "All" ? ` category "${selectedCategory}"` : ""}
                </span>
                <button
                  type="button"
                  className="font-medium text-pink-600"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </div>
            )}
            {!searchQuery && selectedCategory === "All" && activeViewLabel && (
              <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <span>
                  Active view: {activeViewLabel}
                </span>
                <button
                  type="button"
                  className="font-medium text-pink-600"
                  onClick={clearFilters}
                >
                  Show full catalog
                </button>
              </div>
            )}

            <div ref={productResultsRef} className="[overflow-anchor:none]">
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
                <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={handleAddToCart}
                      onViewDetails={handleViewProduct}
                    />
                  ))}
                </div>

                <Pagination className="mt-10">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="/products"
                        onClick={(event) => {
                          event.preventDefault();
                          changePage(page - 1);
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
                            href="/products"
                            isActive={item === page}
                            onClick={(event) => {
                              event.preventDefault();
                              changePage(Number(item));
                            }}
                          >
                            {item}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}

                    <PaginationItem>
                      <PaginationNext
                        href="/products"
                        onClick={(event) => {
                          event.preventDefault();
                          changePage(page + 1);
                        }}
                        aria-disabled={page === totalPages}
                        className={
                          page === totalPages ? "pointer-events-none opacity-50" : ""
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <ShoppingCartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        cartItems={cartItems}
        onRemoveItem={handleRemoveItem}
        onUpdateQuantity={handleUpdateQuantity}
        onCheckout={handleCheckout}
      />

      <ProductDetailModal
        key={selectedProduct?.id ?? "product-detail"}
        product={selectedProduct}
        open={productDetailOpen}
        onClose={() => setProductDetailOpen(false)}
        onAddToCart={handleAddToCart}
      />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab={authDefaultTab}
      />

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cartItems={cartItems}
        onCheckoutComplete={() => {
          clearCart();
        }}
      />
    </div>
  );
}
