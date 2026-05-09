"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Header } from "./Header";
import { ShoppingCartDrawer } from "./ShoppingCartDrawer";
import { AuthModal } from "./auth/AuthModal";
import { CheckoutModal } from "./checkout/CheckoutModal";
import { useAuth } from "../contexts/AuthContext";
import { useStoreCart } from "../contexts/StoreCartContext";

type AuthTab = "login" | "signup";

export function SiteHeaderShell() {
  const router = useRouter();
  const { isAdmin, signOut, user } = useAuth();
  const {
    items: cartItems,
    clearCart,
    distinctItemCount,
    removeItem,
    updateQuantity,
  } = useStoreCart();
  const [authOpen, setAuthOpen] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState<AuthTab>("login");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const openAuth = (tab: AuthTab) => {
    setAuthDefaultTab(tab);
    setAuthOpen(true);
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
    if (section === "home") {
      router.push("/");
      return;
    }

    if (section === "products") {
      router.push("/products");
      return;
    }

    router.push(`/#${section}`);
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

  return (
    <>
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

      <ShoppingCartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        cartItems={cartItems}
        onRemoveItem={removeItem}
        onUpdateQuantity={updateQuantity}
        onCheckout={handleCheckout}
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
    </>
  );
}
