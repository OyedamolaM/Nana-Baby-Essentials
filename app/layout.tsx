import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_NAME, SITE_TAGLINE, buildAbsoluteUrl } from "../lib/site";

const COOKIE_CONSENT_KEY = "nbe_cookie_consent";
const brandFont = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-brand",
  weight: ["400", "500", "600", "700"],
});

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${brandFont.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <Providers initialCookieConsent={initialCookieConsent}>{children}</Providers>
      </body>
    </html>
  );
}
