"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { About } from "./components/About";
import { BabyRegistryHighlight } from "./components/BabyRegistryHighlight";
import { CollectionShowcase } from "./components/CollectionShowcase";
import { DealOfTheWeek } from "./components/DealOfTheWeek";
import { Footer } from "./components/Footer";
import { FAQ } from "./components/FAQ";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { type Product } from "./components/ProductCard";
import { ProductDetailModal } from "./components/ProductDetailModal";
import { ProductShowcase } from "./components/ProductShowcase";
import { ShoppingCartDrawer } from "./components/ShoppingCartDrawer";
import { AuthModal } from "./components/auth/AuthModal";
import { CheckoutModal } from "./components/checkout/CheckoutModal";
import { CreateRegistryModal } from "./components/registry/CreateRegistryModal";
import { useAuth } from "./contexts/AuthContext";
import { useStoreCart } from "./contexts/StoreCartContext";
import { useActiveCollections } from "./hooks/useContentData";
import { useFeaturedProducts } from "./hooks/usePaginatedProducts";
import { AdminDashboard } from "./pages/AdminDashboard";
import { UserDashboard } from "./pages/UserDashboard";

type AppView = "store" | "dashboard" | "admin";
type AuthTab = "login" | "signup";

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
  const featuredProducts = useFeaturedProducts({ onlyInStock: false, limit: 4 });
  const collections = useActiveCollections(4);

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

  const openProductsPage = () => {
    router.push("/products");
  };

  const handleNavigate = (
    section: "home" | "products" | "about" | "faq",
  ) => {
    if (section === "products") {
      openProductsPage();
      return;
    }

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
          <>
            <section id="home">
              <Hero
                onShopNow={openProductsPage}
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
              onViewAll={openProductsPage}
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
