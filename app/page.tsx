"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { About } from "./components/About";
import { BabyRegistryHighlight } from "./components/BabyRegistryHighlight";
import { CategoryFilter } from "./components/CategoryFilter";
import { CollectionShowcase } from "./components/CollectionShowcase";
import { DealOfTheWeek } from "./components/DealOfTheWeek";
import { Footer } from "./components/Footer";
import { FAQ } from "./components/FAQ";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { ProductCard, type Product } from "./components/ProductCard";
import { ProductDetailModal } from "./components/ProductDetailModal";
import { ProductShowcase } from "./components/ProductShowcase";
import { ShoppingCartDrawer } from "./components/ShoppingCartDrawer";
import { AuthModal } from "./components/auth/AuthModal";
import { CheckoutModal } from "./components/checkout/CheckoutModal";
import { CreateRegistryModal } from "./components/registry/CreateRegistryModal";
import { useAuth } from "./contexts/AuthContext";
import { useStoreCart } from "./contexts/StoreCartContext";
import { useActiveCollections } from "./hooks/useContentData";
import { useFeaturedProducts, usePaginatedProducts } from "./hooks/usePaginatedProducts";
import { AdminDashboard } from "./pages/AdminDashboard";
import { UserDashboard } from "./pages/UserDashboard";
import {
  CATEGORIES,
} from "../lib/commerce";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./components/ui/pagination";

type AppView = "store" | "dashboard" | "admin";
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

export default function App() {
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
  const [activeView, setActiveView] = useState<AppView>("store");
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState<AuthTab>("login");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const productsRef = useRef<HTMLElement>(null);
  const featuredProducts = useFeaturedProducts({ onlyInStock: false, limit: 4 });
  const collections = useActiveCollections(4);
  const {
    loading: productsLoading,
    page,
    products,
    searchQuery,
    selectedCategory,
    setPage,
    setSearchQuery,
    setSelectedCategory,
    totalCount,
    totalPages,
  } = usePaginatedProducts({ pageSize: 16 });

  const paginationItems = buildPagination(page, totalPages);

  const runAfterStoreRender = (callback: () => void) => {
    setActiveView("store");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(callback);
    });
  };

  const scrollToSection = (sectionId: string) => {
    if (sectionId === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToProducts = () => {
    productsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const openAuth = (tab: AuthTab) => {
    setAuthDefaultTab(tab);
    setAuthOpen(true);
  };

  const handleAddToCart = (product: Product, quantity = 1) => {
    addItem(product, quantity);
    toast.success(
      quantity > 1
        ? `${quantity} ${product.name} items added to cart.`
        : `${product.name} added to cart.`,
    );
  };

  const handleRemoveItem = (productId: number) => {
    removeItem(productId);
    toast.info("Item removed from cart.");
  };

  const handleUpdateQuantity = (productId: number, quantity: number) => {
    updateQuantity(productId, quantity);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    runAfterStoreRender(scrollToProducts);
  };

  const handleNavigate = (
    section: "home" | "products" | "about" | "faq",
  ) => {
    runAfterStoreRender(() => scrollToSection(section));
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

  const handleCreateRegistry = () => {
    if (!user) {
      toast.info("Create an account to start your registry.");
      openAuth("signup");
      return;
    }

    setRegistryOpen(true);
  };

  const handleOpenDashboard = () => {
    if (!user) {
      openAuth("login");
      return;
    }

    setActiveView("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

    setActiveView("admin");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSignOut = async () => {
    await signOut();
    setActiveView("store");
    toast.success("Signed out.");
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("All");
  };

  return (
    <div className="min-h-screen bg-white">
      <Header
        activeView={activeView}
        cartItemCount={distinctItemCount}
        isAuthenticated={Boolean(user)}
        isAdmin={isAdmin}
        showSearch={activeView === "store"}
        onCartClick={() => setCartOpen(true)}
        onSearch={handleSearch}
        onNavigate={handleNavigate}
        onSignIn={() => openAuth("login")}
        onOpenDashboard={handleOpenDashboard}
        onOpenAdmin={handleOpenAdmin}
        onSignOut={handleSignOut}
      />

      <main>
        {activeView === "store" ? (
          <>
            <section id="home">
              <Hero
                onShopNow={scrollToProducts}
                onCreateRegistry={handleCreateRegistry}
              />
            </section>

            <section id="registry">
              <BabyRegistryHighlight
                onCreateRegistry={handleCreateRegistry}
                onExploreRegistry={() => router.push("/registry")}
              />
            </section>

            <ProductShowcase
              products={featuredProducts}
              onAddToCart={handleAddToCart}
              onViewProduct={handleViewProduct}
              onViewAll={scrollToProducts}
            />

            <DealOfTheWeek
              onAddToCart={(product) => handleAddToCart(product)}
              onViewDetails={handleViewProduct}
            />

            <CollectionShowcase
              collections={collections}
              onAddToCart={handleAddToCart}
              onViewProduct={handleViewProduct}
              sectionSubtitle="Admin-managed collections let you highlight seasonal edits, gifting picks, or any new merchandising story."
            />
            <section id="about">
              <About />
            </section>

            <section
              id="products"
              ref={productsRef}
              className="bg-gradient-to-b from-white to-gray-50 py-20"
            >
              <div className="container mx-auto px-4">
                <div className="mb-8 text-center">
                  <h2 className="mb-2 text-4xl font-bold text-gray-900">
                    {searchQuery
                      ? `Search Results for "${searchQuery}"`
                      : "All Products"}
                  </h2>
                  <p className="text-gray-600">
                    {searchQuery
                      ? `${totalCount} products found`
                      : "Browse our complete collection"}
                  </p>
                </div>

                <CategoryFilter
                  categories={[...CATEGORIES]}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                />

                {(searchQuery || selectedCategory !== "All") && (
                  <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <span>
                      Active filters:
                      {searchQuery ? ` search "${searchQuery}"` : ""}
                      {searchQuery && selectedCategory !== "All" ? " and" : ""}
                      {selectedCategory !== "All"
                        ? ` category "${selectedCategory}"`
                        : ""}
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

                {productsLoading ? (
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
                            href="#products"
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
                                href="#products"
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
                            href="#products"
                            onClick={(event) => {
                              event.preventDefault();
                              if (page < totalPages) {
                                setPage(page + 1);
                              }
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
            </section>

            <section id="faq">
              <FAQ />
            </section>
          </>
        ) : activeView === "admin" ? (
          <AdminDashboard />
        ) : (
          <UserDashboard />
        )}
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

      <CreateRegistryModal
        open={registryOpen}
        onClose={() => setRegistryOpen(false)}
        onCreated={(shareCode) => {
          toast.success(`Your registry code ${shareCode} is ready to share.`);
        }}
      />
    </div>
  );
}
