import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_NAME, SITE_TAGLINE, buildAbsoluteUrl } from "../lib/site";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
