import type { Metadata } from "next";

const DEFAULT_SITE_URL = "https://nanasbabyessentials.com";

export const SITE_NAME = "Nana's Baby Essentials";
export const SITE_TAGLINE = "Baby Store and Baby Registry";

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;
}

export function buildAbsoluteUrl(path = "/") {
  return new URL(path, getSiteUrl()).toString();
}

type MetadataOptions = {
  description: string;
  image?: string | null;
  noIndex?: boolean;
  path?: string;
  title: string;
  type?: "article" | "website";
};

export function buildPageMetadata({
  description,
  image,
  noIndex = false,
  path = "/",
  title,
  type = "website",
}: MetadataOptions): Metadata {
  const canonical = buildAbsoluteUrl(path);
  const metadata: Metadata = {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type,
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };

  if (noIndex) {
    metadata.robots = {
      index: false,
      follow: false,
    };
  }

  return metadata;
}
