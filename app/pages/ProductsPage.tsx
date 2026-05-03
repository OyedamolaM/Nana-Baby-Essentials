"use client";

import { useState } from "react";
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
import { CreateRegistryModal } from "../components/registry/CreateRegistryModal";
import { useAuth } from "../contexts/AuthContext";
import { useStoreCart } from "../contexts/StoreCartContext";
import { useActiveCollections } from "../hooks/useContentData";
import { usePaginatedProducts } from "../hooks/usePaginatedProducts";
import { AdminDashboard } from "./AdminDashboard";
import { UserDashboard } from "./UserDashboard";
import { CATEGORIES } from "../../lib/commerce";
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
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";

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

export function ProductsPage() {
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
  const [selectedCollectionId, setSelectedCollectionId] = useState("all");
  const collections = useActiveCollections(4);
  const {
    loading,
    page,
    products,
    searchQuery,
    selectedCategory,
    setPage,
    setSearchQuery,
    setSelectedCategory,
    totalCount,
    totalPages,
  } = usePaginatedProducts({
    pageSize: 16,
    collectionId: selectedCollectionId === "all" ? null : selectedCollectionId,
  });

  const paginationItems = buildPagination(page, totalPages);
  const selectedCollectionName =
    collections.find((collection) => collection.id === selectedCollectionId)?.name ?? "";

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

  const handleNavigate = (section: "home" | "products" | "about" | "faq") => {
    if (section === "home") {
      router.push("/");
      return;
    }

    if (section === "products") {
      setActiveView("store");
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
    setSelectedCollectionId("all");
  };

  const handleSelectCollection = (collectionId: string) => {
    setSelectedCollectionId(collectionId);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-white">
      <Header
        activeView={activeView}
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
        {activeView === "store" ? (
          <section className="bg-gradient-to-b from-white to-gray-50 py-16 sm:py-20">
            <div className="container mx-auto px-4">
              <div className="mb-10 text-center">
                <h1 className="mb-2 text-4xl font-bold text-gray-900 sm:text-5xl">
                  {searchQuery ? `Search Results for "${searchQuery}"` : "All Products"}
                </h1>
                <p className="mx-auto max-w-2xl text-gray-600">
                  {searchQuery
                    ? `${totalCount} products found`
                    : "Browse the full Nana's Baby Essentials catalog with search, collection filters, and pagination."}
                </p>
              </div>

              <div className="mx-auto mb-8 max-w-2xl">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search for products..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="py-6 pl-10 text-base sm:text-lg"
                  />
                </div>
              </div>

              <div className="mb-6 overflow-x-auto pb-2">
                <Tabs value={selectedCollectionId} onValueChange={handleSelectCollection}>
                  <TabsList className="inline-flex h-auto min-w-max gap-2 rounded-full bg-pink-50 p-1">
                    <TabsTrigger value="all" className="rounded-full px-4">
                      All Products
                    </TabsTrigger>
                    {collections.map((collection) => (
                      <TabsTrigger
                        key={collection.id}
                        value={collection.id}
                        className="rounded-full px-4"
                      >
                        {collection.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              <CategoryFilter
                categories={[...CATEGORIES]}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
              />

              {(searchQuery || selectedCategory !== "All" || selectedCollectionId !== "all") && (
                <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <span>
                    Active filters:
                    {selectedCollectionId !== "all"
                      ? ` collection "${selectedCollectionName || "Selected"}"`
                      : ""}
                    {selectedCollectionId !== "all" && (searchQuery || selectedCategory !== "All")
                      ? ","
                      : ""}
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
                              href="/products"
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
                          href="/products"
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
