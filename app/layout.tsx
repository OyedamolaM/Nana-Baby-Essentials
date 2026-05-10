import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_NAME, SITE_TAGLINE, buildAbsoluteUrl } from "../lib/site";

const COOKIE_CONSENT_KEY = "nbe_cookie_consent";

export const metadata: Metadata = {
  metadataBase: new URL(buildAbsoluteUrl("/")),
  title: {
    default: `${SITE_NAME} | ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Shop premium baby essentials, build a shareable registry, and explore parenting guides from Nana's Baby Essentials.",
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
  },
};

function resolveInitialCookieConsent(cookieValue?: string) {
  if (cookieValue === "accepted" || cookieValue === "rejected") {
    return cookieValue;
  }

  return "unknown";
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const initialCookieConsent = resolveInitialCookieConsent(
    cookieStore.get(COOKIE_CONSENT_KEY)?.value,
  );

  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers initialCookieConsent={initialCookieConsent}>{children}</Providers>
      </body>
    </html>
  );
}
