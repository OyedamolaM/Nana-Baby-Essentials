"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Button } from "../ui/button";

export type CookieConsentState = "accepted" | "rejected" | "unknown";

const COOKIE_CONSENT_KEY = "nbe_cookie_consent";
const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

type CookieConsentContextValue = {
  consent: CookieConsentState;
  setConsent: (nextConsent: Exclude<CookieConsentState, "unknown">) => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | undefined>(
  undefined,
);

function readConsentCookie(): CookieConsentState {
  if (typeof document === "undefined") {
    return "unknown";
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_CONSENT_KEY}=([^;]*)`),
  );
  const value = match?.[1];

  if (value === "accepted" || value === "rejected") {
    return value;
  }

  return "unknown";
}

function writeConsentCookie(value: Exclude<CookieConsentState, "unknown">) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = [
    `${COOKIE_CONSENT_KEY}=${value}`,
    `Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ].join("; ");
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsentState] = useState<CookieConsentState>("unknown");

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setConsentState(readConsentCookie());
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const setConsent = useCallback(
    (nextConsent: Exclude<CookieConsentState, "unknown">) => {
      writeConsentCookie(nextConsent);
      setConsentState(nextConsent);
    },
    [],
  );

  const value = useMemo(
    () => ({
      consent,
      setConsent,
    }),
    [consent, setConsent],
  );

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);

  if (!context) {
    throw new Error("useCookieConsent must be used within a CookieConsentProvider.");
  }

  return context;
}

export function CookieConsentBanner() {
  const pathname = usePathname();
  const { consent, setConsent } = useCookieConsent();

  const isPublicRoute = useMemo(() => {
    return !(
      pathname.startsWith("/admin") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/complete-profile")
    );
  }, [pathname]);

  if (!isPublicRoute || consent !== "unknown") {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-gray-200 bg-white/96 shadow-[0_-18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="max-w-3xl space-y-2">
          <p className="text-2xl font-bold tracking-[-0.03em] text-gray-900">
            Cookie Preferences
          </p>
          <p className="text-sm leading-6 text-gray-600 sm:text-base">
            We use essential session cookies to keep sign-in, carts, and checkout
            working. Optional analytics cookies help us improve the store experience.
            Choose whether to allow those optional cookies.
          </p>
        </div>

        <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[22rem]">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setConsent("rejected")}
          >
            Reject Optional Cookies
          </Button>
          <Button
            type="button"
            className="w-full"
            onClick={() => setConsent("accepted")}
          >
            Accept Cookies
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsBridge() {
  const { consent } = useCookieConsent();

  if (consent !== "accepted") {
    return null;
  }

  return <Analytics />;
}
