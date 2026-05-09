"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { useCookieConsent } from "../cookies/CookieConsentManager";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

const NEWSLETTER_SUBSCRIBED_KEY = "nbe_newsletter_subscribed";
const NEWSLETTER_DISMISSED_UNTIL_KEY = "nbe_newsletter_dismissed_until";
const TWO_MINUTES_MS = 2 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isSuppressed() {
  if (typeof window === "undefined") {
    return true;
  }

  const subscribed = window.localStorage.getItem(NEWSLETTER_SUBSCRIBED_KEY);
  if (subscribed === "1") {
    return true;
  }

  const dismissedUntil = Number(
    window.localStorage.getItem(NEWSLETTER_DISMISSED_UNTIL_KEY) ?? "0",
  );
  return Number.isFinite(dismissedUntil) && dismissedUntil > Date.now();
}

export function NewsletterPopup() {
  const pathname = usePathname();
  const { consent } = useCookieConsent();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isPublicRoute = useMemo(() => {
    return !(
      pathname.startsWith("/admin") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/complete-profile")
    );
  }, [pathname]);
  const canShowPopup =
    consent === "accepted" && isPublicRoute && !isSuppressed();

  useEffect(() => {
    if (!canShowPopup) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!isSuppressed()) {
        setOpen(true);
      }
    }, TWO_MINUTES_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [canShowPopup, pathname]);

  const dismissForAWeek = () => {
    window.localStorage.setItem(
      NEWSLETTER_DISMISSED_UNTIL_KEY,
      String(Date.now() + SEVEN_DAYS_MS),
    );
    setOpen(false);
  };

  const handleSubscribe = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim()) {
      toast.error("Enter your email to subscribe.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          source: "Timed Popup",
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not subscribe right now.");
        return;
      }

      window.localStorage.setItem(NEWSLETTER_SUBSCRIBED_KEY, "1");
      window.localStorage.removeItem(NEWSLETTER_DISMISSED_UNTIL_KEY);
      toast.success(result?.message ?? "Thanks for subscribing!");
      setEmail("");
      setOpen(false);
    } catch (error) {
      console.error("Failed to subscribe from popup.", error);
      toast.error("Could not subscribe right now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={canShowPopup && open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          dismissForAWeek();
          return;
        }

        setOpen(nextOpen);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Join Nana&apos;s Newsletter</DialogTitle>
          <DialogDescription>
            Get baby care tips, fresh registry ideas, and product offers sent to your inbox.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubscribe} className="space-y-4">
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="sm:flex-1" disabled={submitting}>
              {submitting ? "Subscribing..." : "Subscribe"}
            </Button>
            <Button type="button" variant="outline" className="sm:flex-1" onClick={dismissForAWeek}>
              Maybe Later
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
