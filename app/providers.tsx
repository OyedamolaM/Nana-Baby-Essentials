"use client";

import { Toaster } from "./components/ui/sonner";
import { StoreCartProvider } from "./contexts/StoreCartContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ReviewModalProvider } from "./components/reviews/ReviewModal";
import { ProfileCompletionGate } from "./components/auth/ProfileCompletionGate";
import {
  AnalyticsBridge,
  CookieConsentBanner,
  CookieConsentProvider,
  type CookieConsentState,
} from "./components/cookies/CookieConsentManager";
import { NewsletterPopup } from "./components/newsletter/NewsletterPopup";

export function Providers({
  children,
  initialCookieConsent = "unknown",
}: {
  children: React.ReactNode;
  initialCookieConsent?: CookieConsentState;
}) {
  return (
    <CookieConsentProvider initialConsent={initialCookieConsent}>
      <AuthProvider>
        <ProfileCompletionGate />
        <ReviewModalProvider>
          <StoreCartProvider>
            {children}
            <NewsletterPopup />
            <CookieConsentBanner />
            <AnalyticsBridge />
            <Toaster />
          </StoreCartProvider>
        </ReviewModalProvider>
      </AuthProvider>
    </CookieConsentProvider>
  );
}
