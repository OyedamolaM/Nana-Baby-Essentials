"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { About } from "./components/About";
import { BabyRegistryHighlight } from "./components/BabyRegistryHighlight";
import { CategoryFilter } from "./components/CategoryFilter";
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
import { hasSupabaseEnv, supabase } from "./lib/supabase";
import { AdminDashboard } from "./pages/AdminDashboard";
import { UserDashboard } from "./pages/UserDashboard";
import {
  CATEGORIES,
  SEED_PRODUCTS,
  mapProductRecord,
  type ProductRecord,
} from "../lib/commerce";

type AppView = "store" | "dashboard" | "admin";
type AuthTab = "login" | "signup";

// const { data, error } = await supabase.from("products").select("*");
// console.log(data, error);

interface CartItem extends Product {
  quantity: number;
}

export default function App() {
  const { isAdmin, signOut, user } = useAuth();
  const [activeView, setActiveView] = useState<AppView>("store");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS);
  const [productsLoading, setProductsLoading] = useState(hasSupabaseEnv);
  const [authOpen, setAuthOpen] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState<AuthTab>("login");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const productsRef = useRef<HTMLElement>(null);

  const loadProducts = useCallback(async () => {
    if (!hasSupabaseEnv) {
      setProducts(SEED_PRODUCTS);
      setProductsLoading(false);
      return;
    }

    setProductsLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) {
      setProducts(SEED_PRODUCTS);
      setProductsLoading(false);
      return;
    }

    setProducts((data as ProductRecord[]).map(mapProductRecord));
    setProductsLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProducts();
    });
  }, [loadProducts]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" || product.category === selectedCategory;
      const matchesSearch =
        searchQuery === "" ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [products, searchQuery, selectedCategory]);

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
    setCartItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.id === product.id);

      if (existingItem) {
        toast.success(`Updated ${product.name} in your cart.`);
        return currentItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }

      toast.success(`${product.name} added to cart.`);
      return [...currentItems, { ...product, quantity }];
    });

    setCartOpen(true);
  };

  const handleRemoveItem = (productId: number) => {
    setCartItems((currentItems) =>
      currentItems.filter((item) => item.id !== productId),
    );
    toast.info("Item removed from cart.");
  };

  const handleUpdateQuantity = (productId: number, quantity: number) => {
    setCartItems((currentItems) =>
      currentItems.map((item) =>
        item.id === productId ? { ...item, quantity } : item,
      ),
    );
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

  const totalCartItems = cartItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  return (
    <div className="min-h-screen bg-white">
      <Header
        activeView={activeView}
        cartItemCount={totalCartItems}
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

            <ProductShowcase
              products={products}
              onAddToCart={handleAddToCart}
              onViewProduct={handleViewProduct}
              onViewAll={scrollToProducts}
            />

            <DealOfTheWeek
              onAddToCart={(product) => handleAddToCart(product)}
              onViewDetails={handleViewProduct}
            />

            <section id="registry">
              <BabyRegistryHighlight onCreateRegistry={handleCreateRegistry} />
            </section>

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
                      ? `${filteredProducts.length} products found`
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
                ) : filteredProducts.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-xl text-gray-500">
                      No products found. Try a different search or category.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onAddToCart={handleAddToCart}
                        onViewDetails={handleViewProduct}
                      />
                    ))}
                  </div>
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
          setCartItems([]);
          void loadProducts();
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
