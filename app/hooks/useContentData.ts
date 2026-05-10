"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FALLBACK_BLOG_POSTS,
  type BlogPostRecord,
  type HomeDealRecord,
  type HomepageDeal,
} from "../../lib/content";
import {
  SEED_PRODUCTS,
  mapProductRecord,
  type ProductRecord,
} from "../../lib/commerce";
import { hasSupabaseEnv, supabase } from "../lib/supabase";

type ProductJoinRow = {
  products: ProductRecord | ProductRecord[] | null;
};

type DealRow = HomeDealRecord & ProductJoinRow;

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

function buildFallbackDeals() {
  return SEED_PRODUCTS.slice(0, 3).map((product, index) => ({
    id: `fallback-deal-${product.id}`,
    title: product.name,
    subtitle:
      product.description ||
      "A hand-picked baby essential with a limited-time savings window.",
    badgeText: index === 0 ? "Best Value" : "Limited-Time Deal",
    salePrice: product.price,
    compareAtPrice: Number((product.price * 1.35).toFixed(2)),
    image: product.image,
    startsAt: null,
    endsAt: new Date(
      Date.now() + (index + 3) * 24 * 60 * 60 * 1000,
    ).toISOString(),
    product,
  }));
}

function mapHomepageDeals(
  data: DealRow[],
  fallbackProductsById?: Record<number, ProductRecord>,
) {
  return data
    .filter((deal) => isDealActive(deal))
    .flatMap((deal) => {
      const productRecord = (Array.isArray(deal.products)
        ? deal.products[0]
        : deal.products) ?? fallbackProductsById?.[Number(deal.product_id)] ?? null;
      if (!productRecord) {
        return [];
      }

      const product = mapProductRecord(productRecord as ProductRecord);

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
        image: deal.override_image || product.image,
        startsAt: deal.starts_at,
        endsAt: deal.ends_at,
        product,
      } satisfies HomepageDeal];
    });
}

export function useHomepageDeals(initialDeals?: HomepageDeal[]) {
  const [deals, setDeals] = useState<HomepageDeal[]>(
    initialDeals && initialDeals.length > 0 ? initialDeals : buildFallbackDeals(),
  );

  useEffect(() => {
    if (!hasSupabaseEnv) {
      return;
    }

    const loadDeals = async () => {
      const { data, error } = await supabase
        .from("homepage_deals")
        .select("*, products(*)")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error || !data || data.length === 0) {
        setDeals((currentDeals) => {
          return currentDeals.length > 0 ? currentDeals : buildFallbackDeals();
        });
        return;
      }

      const dealRows = data as DealRow[];
      const missingProductIds = dealRows
        .filter((deal) => !deal.products)
        .map((deal) => Number(deal.product_id))
        .filter((productId) => Number.isFinite(productId));
      let fallbackProductsById: Record<number, ProductRecord> | undefined;

      if (missingProductIds.length > 0) {
        const { data: productRows } = await supabase
          .from("products")
          .select("*")
          .in("id", missingProductIds);

        fallbackProductsById = Object.fromEntries(
          ((productRows as ProductRecord[] | null) ?? []).map((product) => [
            Number(product.id),
            product,
          ]),
        ) as Record<number, ProductRecord>;
      }

      const mappedDeals = mapHomepageDeals(dealRows, fallbackProductsById);

      setDeals((currentDeals) => {
        if (mappedDeals.length > 0) {
          return mappedDeals;
        }

        return currentDeals.length > 0 ? currentDeals : buildFallbackDeals();
      });
    };

    void loadDeals();
  }, [initialDeals]);

  return deals;
}

export function usePublishedBlogPosts(initialPosts?: BlogPostRecord[]) {
  const [posts, setPosts] = useState<BlogPostRecord[]>(
    initialPosts && initialPosts.length > 0 ? initialPosts : FALLBACK_BLOG_POSTS,
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
        .select("*")
        .eq("is_published", true)
        .order("published_at", { ascending: false });

      if (error || !data || data.length === 0) {
        setPosts(FALLBACK_BLOG_POSTS);
        setLoading(false);
        return;
      }

      setPosts(data as BlogPostRecord[]);
      setLoading(false);
    };

    void loadPosts();
  }, [initialPosts]);

  const postLookup = useMemo(() => {
    return Object.fromEntries(posts.map((post) => [post.slug, post])) as Record<
      string,
      BlogPostRecord
    >;
  }, [posts]);

  return {
    loading,
    posts,
    postLookup,
  };
}
