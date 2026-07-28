"use client";

import { useEffect, useState } from "react";
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
import { ReviewsSection } from "../components/ReviewsSection";
import { SpecialPackagesSection } from "../components/SpecialPackagesSection";
import { ShoppingCartDrawer } from "../components/ShoppingCartDrawer";
import { AuthModal } from "../components/auth/AuthModal";
import { CheckoutModal } from "../components/checkout/CheckoutModal";
import { FeaturedCategoryTabs } from "../components/featured/FeaturedCategoryTabs";
import { RegistryCreateModal } from "../components/registry/RegistryCreateModal";
import { useAuth } from "../contexts/AuthContext";
import { useStoreCart } from "../contexts/StoreCartContext";
import { type StoreProduct, type StoreProductVariant } from "../../lib/commerce";
import { type HomepageDeal } from "../../lib/content";
import { type SpecialPackage } from "../../lib/specialPackages";
import { type StoreLocationRecord } from "../../lib/storeLocations";
import {
  type HomepageReview,
  type HomepageSiteContent,
} from "../../lib/siteContent";
import {
  clearProductDetailReturnContext,
  getCurrentProductReturnPath,
  readProductDetailReturnContext,
} from "../../lib/productDetailReturn";

type AuthTab = "login" | "signup";

interface HomePageProps {
  initialDeals?: HomepageDeal[];
  initialHomepageReviews?: HomepageReview[];
  initialHomepageSiteContent?: HomepageSiteContent;
  initialProductCategories?: string[];
  initialProducts?: StoreProduct[];
  initialProductTotalCount?: number;
  initialSpecialPackages?: SpecialPackage[];
  initialStoreLocations?: StoreLocationRecord[];
}

export function HomePage({
  initialDeals,
  initialHomepageReviews,
  initialHomepageSiteContent,
  initialProductCategories,
  initialProducts,
  initialProductTotalCount,
  initialSpecialPackages = [],
  initialStoreLocations = [],
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

  const handleAddToCart = (product: Product, quantity = 1, variant?: StoreProductVariant) => {
    addItem(product, quantity, variant);
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

  const handleShopNow = () => {
    scrollToSection("products");
  };

  const giftBundles = initialSpecialPackages.filter(
    (entry) => entry.packageType === "gift_bundle",
  );
  const swoopPackages = initialSpecialPackages.filter(
    (entry) => entry.packageType === "swoop_package",
  );

  return (
    <div className="min-h-screen bg-white">
      <Header
        cartItemCount={distinctItemCount}
        isAuthenticated={Boolean(user)}
        isAdmin={isAdmin}
        locations={initialStoreLocations}
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
          <Hero
            image={initialHomepageSiteContent?.heroImage}
            onCreateRegistry={handleCreateRegistry}
            onGetSwoopPackage={() => scrollToSection("special-packages")}
            onShopNow={handleShopNow}
          />
        </section>

        <section id="registry">
          <BabyRegistryHighlight onCreateRegistry={handleCreateRegistry} />
        </section>

        <SpecialPackagesSection
          actionLabel="Add to Cart"
          giftBundles={giftBundles}
          onAction={(pkg, quantity = 1) => handleAddToCart(pkg.product, quantity)}
          swoopPackages={swoopPackages}
        />

        <DealOfTheWeek
          initialDeals={initialDeals}
          onAddToCart={(product) => handleAddToCart(product)}
          onViewDetails={handleViewProduct}
        />

        <FeaturedCategoryTabs
          categories={initialProductCategories}
          initialProducts={initialProducts}
          initialTotalCount={initialProductTotalCount}
          sectionId="products"
          onAddToCart={handleAddToCart}
          onViewAll={() => router.push("/products")}
          onViewProduct={handleViewProduct}
          sectionTitle="Products"
          sectionSubtitle="Browse all baby essentials by category, search within the section, and move through the catalog."
        />

        <section id="about">
          <About images={initialHomepageSiteContent?.aboutImages} />
        </section>

        <section id="reviews">
          <ReviewsSection reviews={initialHomepageReviews} />
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
        onCreated={(registry) => router.push(registry.dashboardPath)}
      />
    </div>
  );
}