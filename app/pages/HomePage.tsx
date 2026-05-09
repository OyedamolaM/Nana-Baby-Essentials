"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { About } from "../components/About";
import { BabyRegistryHighlight } from "../components/BabyRegistryHighlight";
import { DealOfTheWeek } from "../components/DealOfTheWeek";
import { FAQ } from "../components/FAQ";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { type Product } from "../components/ProductCard";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { ShoppingCartDrawer } from "../components/ShoppingCartDrawer";
import { AuthModal } from "../components/auth/AuthModal";
import { CheckoutModal } from "../components/checkout/CheckoutModal";
import { FeaturedCategoryTabs } from "../components/featured/FeaturedCategoryTabs";
import { RegistryCreateModal } from "../components/registry/RegistryCreateModal";
import { useAuth } from "../contexts/AuthContext";
import { useStoreCart } from "../contexts/StoreCartContext";
import { useFeaturedProducts } from "../hooks/usePaginatedProducts";
import { type StoreProduct } from "../../lib/commerce";
import { type HomepageDeal } from "../../lib/content";

type AuthTab = "login" | "signup";

interface HomePageProps {
  initialDeals?: HomepageDeal[];
  initialFeaturedProducts?: StoreProduct[];
}

export function HomePage({
  initialDeals,
  initialFeaturedProducts,
}: HomePageProps) {
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
  const [registryCreateOpen, setRegistryCreateOpen] = useState(false);
  const featuredProducts = useFeaturedProducts({
    onlyInStock: false,
    limit: 8,
    initialProducts: initialFeaturedProducts,
  });

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

  const handleNavigate = (section: "home" | "products" | "about" | "faq") => {
    if (section === "products") {
      router.push("/products");
      return;
    }

    scrollToSection(section);
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

  const handleViewProduct = (product: Product) => {
    setSelectedProduct(product);
    setProductDetailOpen(true);
  };

  const handleCreateRegistry = () => {
    if (!user) {
      toast.info("Create an account to start your registry.");
      openAuth("signup");
      return;
    }

    setRegistryCreateOpen(true);
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
        <section id="home">
          <Hero onCreateRegistry={handleCreateRegistry} />
        </section>

        <section id="registry">
          <BabyRegistryHighlight onCreateRegistry={handleCreateRegistry} />
        </section>

        <DealOfTheWeek
          initialDeals={initialDeals}
          onAddToCart={(product) => handleAddToCart(product)}
          onViewDetails={handleViewProduct}
        />

        <FeaturedCategoryTabs
          products={featuredProducts}
          onAddToCart={handleAddToCart}
          onViewProduct={handleViewProduct}
          sectionTitle="Products"
          sectionSubtitle="Browse our baby essentials by category, including an easy all-products view."
        />

        <section id="about">
          <About />
        </section>

        <section id="faq">
          <FAQ />
        </section>
      </main>

      <Footer />

      <ShoppingCartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        cartItems={cartItems}
        onRemoveItem={removeItem}
        onUpdateQuantity={updateQuantity}
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

      <RegistryCreateModal
        open={registryCreateOpen}
        onOpenChange={setRegistryCreateOpen}
        onCreated={(registryId) => router.push(`/dashboard/registries/${registryId}`)}
      />
    </div>
  );
}
