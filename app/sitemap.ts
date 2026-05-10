import type { MetadataRoute } from "next";

import { createSupabaseServerClient, hasSupabaseServerEnv } from "../lib/supabaseServer";
import { buildAbsoluteUrl } from "../lib/site";
import { FALLBACK_BLOG_POSTS } from "../lib/content";
import { SEED_PRODUCTS, type ProductRecord } from "../lib/commerce";

type BlogRow = {
  published_at?: string | null;
  slug: string;
  updated_at?: string | null;
};

type RegistryRow = {
  share_code: string;
  updated_at?: string | null;
};

type StoreLocationRow = {
  slug: string;
  updated_at?: string | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const urls: MetadataRoute.Sitemap = [
    {
      url: buildAbsoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: buildAbsoluteUrl("/products"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: buildAbsoluteUrl("/registry"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: buildAbsoluteUrl("/blog"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: buildAbsoluteUrl("/privacy-policy"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: buildAbsoluteUrl("/terms-of-service"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: buildAbsoluteUrl("/shipping-returns-policy"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];

  if (!hasSupabaseServerEnv) {
    urls.push(
      ...SEED_PRODUCTS.map((product) => ({
        url: buildAbsoluteUrl(`/products/${product.slug}`),
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...FALLBACK_BLOG_POSTS.map((post) => ({
        url: buildAbsoluteUrl(`/blog/${post.slug}`),
        lastModified: post.published_at ? new Date(post.published_at) : now,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    );
    return urls;
  }

  const client = createSupabaseServerClient();
  if (!client) {
    return urls;
  }

  const [{ data: products }, { data: posts }, { data: registries }, { data: locations }] =
    await Promise.all([
    client
      .from("products")
      .select("slug, created_at, updated_at")
      .eq("product_kind", "standard"),
    client
      .from("blog_posts")
      .select("slug, published_at, updated_at")
      .eq("is_published", true),
    client.from("registries").select("share_code, updated_at"),
    client
      .from("store_locations")
      .select("slug, updated_at")
      .eq("is_active", true),
  ]);

  urls.push(
    ...((products as Array<ProductRecord & { updated_at?: string | null }> | null) ?? [])
      .filter((product) => Boolean(product.slug))
      .map((product) => ({
        url: buildAbsoluteUrl(`/products/${product.slug}`),
        lastModified: product.updated_at ? new Date(product.updated_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
  );

  urls.push(
    ...((posts as BlogRow[] | null) ?? []).map((post) => ({
      url: buildAbsoluteUrl(`/blog/${post.slug}`),
      lastModified: post.updated_at
        ? new Date(post.updated_at)
        : post.published_at
          ? new Date(post.published_at)
          : now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  );

  urls.push(
    ...((registries as RegistryRow[] | null) ?? []).map((registry) => ({
      url: buildAbsoluteUrl(`/registry/${registry.share_code}`),
      lastModified: registry.updated_at ? new Date(registry.updated_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  );

  urls.push(
    ...((locations as StoreLocationRow[] | null) ?? []).map((location) => ({
      url: buildAbsoluteUrl(`/locations/${location.slug}`),
      lastModified: location.updated_at ? new Date(location.updated_at) : now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  );

  return urls;
}
