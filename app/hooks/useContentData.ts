"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FALLBACK_BLOG_POSTS,
  type BlogPostRecord,
  type CollectionRecord,
  type HomeDealRecord,
} from "../../lib/content";
import {
  SEED_PRODUCTS,
  mapProductRecord,
  type ProductRecord,
  type StoreProduct,
} from "../../lib/commerce";
import { hasSupabaseEnv, supabase } from "../lib/supabase";

type ProductJoinRow = {
  products: ProductRecord | ProductRecord[] | null;
};

type DealRow = HomeDealRecord & ProductJoinRow;
type CollectionProductRow = {
  collection_id: string;
  sort_order: number;
  products: ProductRecord | ProductRecord[] | null;
};

export interface HomepageDeal {
  id: string;
  title: string;
  subtitle: string;
  badgeText: string;
  salePrice: number;
  compareAtPrice: number;
  image: string;
  startsAt?: string | null;
  endsAt?: string | null;
  product: StoreProduct;
}

export interface CollectionWithProducts {
  id: string;
  name: string;
  slug: string;
  description: string;
  heroImage?: string | null;
  sortOrder: number;
  products: StoreProduct[];
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

export function useHomepageDeals() {
  const [deals, setDeals] = useState<HomepageDeal[]>(buildFallbackDeals());

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
        setDeals(buildFallbackDeals());
        return;
      }

      const mappedDeals = (data as DealRow[])
        .filter((deal) => Boolean(deal.products) && isDealActive(deal))
        .map((deal) => {
          const productRecord = Array.isArray(deal.products)
            ? deal.products[0]
            : deal.products;
          const product = mapProductRecord(productRecord as ProductRecord);

          return {
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
          } satisfies HomepageDeal;
        });

      setDeals(mappedDeals.length > 0 ? mappedDeals : buildFallbackDeals());
    };

    void loadDeals();
  }, []);

  return deals;
}

export function useActiveCollections(limitProductsPerCollection = 4) {
  const [collections, setCollections] = useState<CollectionWithProducts[]>([]);

  useEffect(() => {
    if (!hasSupabaseEnv) {
      return;
    }

    const loadCollections = async () => {
      const { data: collectionRows, error: collectionError } = await supabase
        .from("collections")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (collectionError || !collectionRows || collectionRows.length === 0) {
        setCollections([]);
        return;
      }

      const typedCollections = collectionRows as CollectionRecord[];

      const { data: collectionProductRows, error: collectionProductsError } =
        await supabase
          .from("collection_products")
          .select("collection_id, sort_order, products(*)")
          .in(
            "collection_id",
            typedCollections.map((collection) => collection.id),
          )
          .order("sort_order", { ascending: true });

      if (collectionProductsError || !collectionProductRows) {
        setCollections(
          typedCollections.map((collection) => ({
            id: collection.id,
            name: collection.name,
            slug: collection.slug,
            description: collection.description || "",
            heroImage: collection.hero_image,
            sortOrder: collection.sort_order,
            products: [],
          })),
        );
        return;
      }

      const groupedProducts = (collectionProductRows as CollectionProductRow[]).reduce<
        Record<string, StoreProduct[]>
      >((accumulator, row) => {
        const productRecord = Array.isArray(row.products)
          ? row.products[0]
          : row.products;

        if (!productRecord) {
          return accumulator;
        }

        const existing = accumulator[row.collection_id] ?? [];
        if (existing.length < limitProductsPerCollection) {
          existing.push(mapProductRecord(productRecord));
        }
        accumulator[row.collection_id] = existing;
        return accumulator;
      }, {});

      setCollections(
        typedCollections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
          description: collection.description || "",
          heroImage: collection.hero_image,
          sortOrder: collection.sort_order,
          products: groupedProducts[collection.id] ?? [],
        })),
      );
    };

    void loadCollections();
  }, [limitProductsPerCollection]);

  return collections;
}

export function usePublishedBlogPosts() {
  const [posts, setPosts] = useState<BlogPostRecord[]>(FALLBACK_BLOG_POSTS);
  const [loading, setLoading] = useState(hasSupabaseEnv);

  useEffect(() => {
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
  }, []);

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
