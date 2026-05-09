"use client";

import { Toaster } from "./components/ui/sonner";
import { StoreCartProvider } from "./contexts/StoreCartContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProfileCompletionGate } from "./components/auth/ProfileCompletionGate";
import {
  AnalyticsBridge,
  CookieConsentBanner,
  CookieConsentProvider,
} from "./components/cookies/CookieConsentManager";
import { NewsletterPopup } from "./components/newsletter/NewsletterPopup";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CookieConsentProvider>
      <AuthProvider>
        <ProfileCompletionGate />
        <StoreCartProvider>
          {children}
          <NewsletterPopup />
          <CookieConsentBanner />
          <AnalyticsBridge />
          <Toaster />
        </StoreCartProvider>
      </AuthProvider>
    </CookieConsentProvider>
  );
}
