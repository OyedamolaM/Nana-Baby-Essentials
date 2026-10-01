"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FALLBACK_BLOG_POSTS,
  type BlogPostSummary,
  type HomeDealRecord,
  type HomepageDeal,
} from "../../lib/content";
import {
  PRODUCT_LIST_SELECT,
  mapProductRecord,
  type ProductRecord,
} from "../../lib/commerce";
import { hasSupabaseEnv, supabase } from "../lib/supabase";

const FALLBACK_BLOG_SUMMARIES: BlogPostSummary[] = FALLBACK_BLOG_POSTS.map(
  (post) => ({
    author_name: post.author_name,
    category: post.category,
    cover_image: post.cover_image,
    created_at: post.created_at,
    excerpt: post.excerpt,
    id: post.id,
    is_published: post.is_published,
    published_at: post.published_at,
    slug: post.slug,
    title: post.title,
    updated_at: post.updated_at,
  }),
);

function buildProductLookup(records: ProductRecord[] | null | undefined) {
  return Object.fromEntries(
    (records ?? []).map((product) => [Number(product.id), product]),
  ) as Record<number, ProductRecord>;
}

function isDealActive(deal: HomeDealRecord) {
  const now = Date.now();
  const startsAt = deal.starts_at ? new Date(deal.starts_at).getTime() : null;
  const endsAt = deal.ends_at ? new Date(deal.ends_at).getTime() : null;

  if (startsAt && !Number.isNaN(startsAt) && startsAt > now) {
    return false;
  }

  if (endsAt && !Number.isNaN(endsAt) && endsAt < now) {
    return false;
  }

  return deal.is_active;
}

function mapHomepageDeals(
  data: HomeDealRecord[],
  productsById?: Record<number, ProductRecord>,
) {
  return data
    .filter((deal) => isDealActive(deal))
    .flatMap((deal) => {
      const productRecord = productsById?.[Number(deal.product_id)] ?? null;
      if (!productRecord) {
        return [];
      }

      const product = mapProductRecord(productRecord as ProductRecord);
      const galleryImages = Array.isArray(deal.override_images)
        ? deal.override_images
            .map((url) => url?.trim())
            .filter((url): url is string => Boolean(url))
        : [];
      const primaryImage = galleryImages[0] ?? (deal.override_image?.trim() || product.image);

      return [{
        id: deal.id,
        title: deal.title || product.name,
        subtitle:
          deal.subtitle ||
          product.description ||
          "A featured baby essential for the week.",
        badgeText: deal.badge_text || "Deal of the Week",
        salePrice: Number(deal.sale_price ?? product.price),
        compareAtPrice: Number(
          deal.compare_at_price ?? Math.max(product.price, product.price * 1.25),
        ),
        image: primaryImage,
        images: galleryImages.length > 0 ? galleryImages : [primaryImage],
        startsAt: deal.starts_at,
        endsAt: deal.ends_at,
        product,
      } satisfies HomepageDeal];
    });
}

export function useHomepageDeals(initialDeals?: HomepageDeal[]) {
  const [deals, setDeals] = useState<HomepageDeal[]>(
    initialDeals && initialDeals.length > 0 ? initialDeals : [],
  );

  useEffect(() => {
    if (initialDeals && initialDeals.length > 0) {
      return;
    }

    if (!hasSupabaseEnv) {
      return;
    }

    const loadDeals = async () => {
      const { data, error } = await supabase
        .from("homepage_deals")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error || !data || data.length === 0) {
        setDeals((currentDeals) => {
          return currentDeals.length > 0 ? currentDeals : [];
        });
        return;
      }

      const dealRows = data as HomeDealRecord[];
      const productIds = Array.from(
        new Set(
          dealRows
            .map((deal) => Number(deal.product_id))
            .filter((productId) => Number.isFinite(productId)),
        ),
      );
      let productsById: Record<number, ProductRecord> | undefined;

      if (productIds.length > 0) {
        const { data: productRows } = await supabase
          .from("products")
          .select(PRODUCT_LIST_SELECT)
          .in("product_kind", ["standard", "deal"])
          .in("id", productIds);

        productsById = buildProductLookup((productRows as ProductRecord[] | null) ?? []);
      }

      const mappedDeals = mapHomepageDeals(dealRows, productsById);

      setDeals((currentDeals) => {
        if (mappedDeals.length > 0) {
          return mappedDeals;
        }

        return currentDeals.length > 0 ? currentDeals : [];
      });
    };

    void loadDeals();
  }, [initialDeals]);

  return deals;
}

export function usePublishedBlogPosts(initialPosts?: BlogPostSummary[]) {
  const [posts, setPosts] = useState<BlogPostSummary[]>(
    initialPosts && initialPosts.length > 0 ? initialPosts : FALLBACK_BLOG_SUMMARIES,
  );
  const [loading, setLoading] = useState(
    Boolean(hasSupabaseEnv && !(initialPosts && initialPosts.length > 0)),
  );

  useEffect(() => {
    if (initialPosts && initialPosts.length > 0) {
      return;
    }

    if (!hasSupabaseEnv) {
      return;
    }

    const loadPosts = async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, category, excerpt, cover_image, author_name, published_at, is_published, created_at, updated_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false });

      if (error || !data || data.length === 0) {
        setPosts(FALLBACK_BLOG_SUMMARIES);
        setLoading(false);
        return;
      }

      setPosts(data as BlogPostSummary[]);
      setLoading(false);
    };

    void loadPosts();
  }, [initialPosts]);

  const postLookup = useMemo(() => {
    return Object.fromEntries(posts.map((post) => [post.slug, post])) as Record<
      string,
      BlogPostSummary
    >;
  }, [posts]);

  return {
    loading,
    posts,
    postLookup,
  };
}
