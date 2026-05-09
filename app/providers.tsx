"use client";

import { Toaster } from "./components/ui/sonner";
import { StoreCartProvider } from "./contexts/StoreCartContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProfileCompletionGate } from "./components/auth/ProfileCompletionGate";
import { NewsletterPopup } from "./components/newsletter/NewsletterPopup";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ProfileCompletionGate />
      <StoreCartProvider>
        {children}
        <NewsletterPopup />
        <Toaster />
      </StoreCartProvider>
    </AuthProvider>
  );
}
