"use client";

import dynamic from "next/dynamic";
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

const ClientAnalytics = dynamic(
  () => import("@vercel/analytics/next").then((module) => module.Analytics),
  { ssr: false },
);

export type CookieConsentState = "accepted" | "rejected" | "unknown";

const COOKIE_CONSENT_KEY = "nbe_cookie_consent";
const COOKIE_CONSENT_STORAGE_KEY = "nbe:cookie-consent";
const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

type CookieConsentContextValue = {
  consent: CookieConsentState;
  hasResolvedConsent: boolean;
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

function readConsentStorage(): CookieConsentState {
  if (typeof window === "undefined") {
    return "unknown";
  }

  try {
    const value = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (value === "accepted" || value === "rejected") {
      return value;
    }
  } catch {
    // Ignore storage read failures and fall back to the cookie.
  }

  return "unknown";
}

function readStoredConsent(): CookieConsentState {
  const storageValue = readConsentStorage();
  if (storageValue !== "unknown") {
    return storageValue;
  }

  return readConsentCookie();
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

function writeConsentStorage(value: Exclude<CookieConsentState, "unknown">) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value);
  } catch {
    // Ignore storage write failures and rely on the cookie.
  }
}

export function CookieConsentProvider({
  children,
  initialConsent = "unknown",
}: {
  children: ReactNode;
  initialConsent?: CookieConsentState;
}) {
  const [consent, setConsentState] = useState<CookieConsentState>(initialConsent);
  const [hasResolvedConsent, setHasResolvedConsent] = useState(
    initialConsent !== "unknown",
  );

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const nextConsent = readStoredConsent();
      setConsentState((currentConsent) =>
        currentConsent === nextConsent ? currentConsent : nextConsent,
      );
      setHasResolvedConsent(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const setConsent = useCallback(
    (nextConsent: Exclude<CookieConsentState, "unknown">) => {
      writeConsentCookie(nextConsent);
      writeConsentStorage(nextConsent);
      setConsentState(nextConsent);
    },
    [],
  );

  const value = useMemo(
    () => ({
      consent,
      hasResolvedConsent,
      setConsent,
    }),
    [consent, hasResolvedConsent, setConsent],
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
  const { consent, hasResolvedConsent, setConsent } = useCookieConsent();

  const isPublicRoute = useMemo(() => {
    return !(
      pathname.startsWith("/admin") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/complete-profile")
    );
  }, [pathname]);

  if (!isPublicRoute || !hasResolvedConsent || consent !== "unknown") {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-gray-200 bg-white/96 shadow-[0_-18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="max-w-3xl space-y-2">
          <p className="text-[24px] font-medium leading-tight tracking-tight text-neutral-900 md:text-[28px]">
            Cookie Preferences
          </p>
          <p className="section-copy max-w-3xl">
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
  const { consent, hasResolvedConsent } = useCookieConsent();

  if (!hasResolvedConsent || consent !== "accepted") {
    return null;
  }

  return <ClientAnalytics />;
}
