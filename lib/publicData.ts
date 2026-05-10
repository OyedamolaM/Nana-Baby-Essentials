import { unstable_cache } from "next/cache";

import {
  type BlogPostRecord,
  FALLBACK_BLOG_POSTS,
  type HomeDealRecord,
  type HomepageDeal,
} from "./content";
import {
  SEED_PRODUCTS,
  mapProductRecord,
  type ProductRecord,
  type StoreProduct,
} from "./commerce";
import {
  buildFilterCategoryOptions,
  type ProductCategoryRecord,
} from "./productCategories";
import {
  mapRegistryItemRecord,
  type RegistryItem,
  type RegistryItemRecord,
  type RegistryRecord,
} from "./registry";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabaseServerEnv,
  hasSupabaseServiceRoleEnv,
} from "./supabaseServer";
import {
  hasSavedShippingAddress,
  normalizeShippingAddress,
  type ShippingAddress,
} from "./userProfile";

type ProductJoinRow = {
  products: ProductRecord | ProductRecord[] | null;
};

type DealRow = HomeDealRecord & ProductJoinRow;

type ProductCatalogSnapshot = {
  products: StoreProduct[];
  totalCount: number;
};

type ProductCategorySnapshot = {
  categories: string[];
};

type RegistrySnapshot = {
  items: RegistryItem[];
  registry: RegistryRecord | null;
  shippingAddress: ShippingAddress | null;
};

function filterSeedProducts(
  products: StoreProduct[],
  selectedCategory: string,
  searchQuery: string,
) {
  return products.filter((product) => {
    const matchesCategory =
      selectedCategory === "All" || product.category === selectedCategory;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch =
      normalizedQuery === "" ||
      product.name.toLowerCase().includes(normalizedQuery) ||
      product.description.toLowerCase().includes(normalizedQuery);

    return matchesCategory && matchesSearch;
  });
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
  })) satisfies HomepageDeal[];
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

const getFeaturedProductsCached = unstable_cache(
  async (limit: number, onlyInStock: boolean) => {
    const fallbackProducts = (onlyInStock
      ? SEED_PRODUCTS.filter((product) => product.inStock)
      : SEED_PRODUCTS
    )
      .filter((product) => product.isFeatured)
      .sort((left, right) => left.featuredSortOrder - right.featuredSortOrder)
      .slice(0, limit);

    if (!hasSupabaseServerEnv) {
      return fallbackProducts;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return fallbackProducts;
    }

    let query = client
      .from("products")
      .select("*")
      .eq("is_featured", true)
      .order("featured_sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (onlyInStock) {
      query = query.eq("in_stock", true);
    }

    const { data, error } = await query;

    if (error || !data) {
      return fallbackProducts;
    }

    return (data as ProductRecord[]).map(mapProductRecord);
  },
  ["public-featured-products"],
  { revalidate: 300, tags: ["products"] },
);

const getProductCatalogPageCached = unstable_cache(
  async (
    page: number,
    pageSize: number,
    onlyInStock: boolean,
    selectedCategory: string,
    searchQuery: string,
  ) => {
    const fallbackBase = onlyInStock
      ? SEED_PRODUCTS.filter((product) => product.inStock)
      : SEED_PRODUCTS;
    const fallbackFiltered = filterSeedProducts(
      fallbackBase,
      selectedCategory,
      searchQuery,
    );
    const from = Math.max(0, (page - 1) * pageSize);
    const to = from + pageSize;

    if (!hasSupabaseServerEnv) {
      return {
        products: fallbackFiltered.slice(from, to),
        totalCount: fallbackFiltered.length,
      } satisfies ProductCatalogSnapshot;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return {
        products: fallbackFiltered.slice(from, to),
        totalCount: fallbackFiltered.length,
      } satisfies ProductCatalogSnapshot;
    }

    let query = client
      .from("products")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (onlyInStock) {
      query = query.eq("in_stock", true);
    }

    if (selectedCategory !== "All") {
      query = query.eq("category", selectedCategory);
    }

    if (searchQuery.trim()) {
      const escapedQuery = searchQuery.trim().replace(/,/g, " ");
      query = query.or(
        `name.ilike.%${escapedQuery}%,description.ilike.%${escapedQuery}%`,
      );
    }

    const { data, error, count } = await query.range(from, to - 1);

    if (error || !data) {
      return {
        products: fallbackFiltered.slice(from, to),
        totalCount: fallbackFiltered.length,
      } satisfies ProductCatalogSnapshot;
    }

    return {
      products: (data as ProductRecord[]).map(mapProductRecord),
      totalCount: count ?? data.length,
    } satisfies ProductCatalogSnapshot;
  },
  ["public-product-catalog-page"],
  { revalidate: 300, tags: ["products"] },
);

const getProductCategoriesCached = unstable_cache(
  async () => {
    const fallbackCategories = buildFilterCategoryOptions({
      includeProductCategories: SEED_PRODUCTS.map((product) => product.category),
      records: [],
    });

    if (!hasSupabaseServerEnv) {
      return {
        categories: fallbackCategories,
      } satisfies ProductCategorySnapshot;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return {
        categories: fallbackCategories,
      } satisfies ProductCategorySnapshot;
    }

    const [categoryResult, productResult] = await Promise.all([
      client
        .from("product_categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      client.from("products").select("category").order("created_at", { ascending: false }),
    ]);

    const categoryRecords =
      categoryResult.error?.code === "42P01"
        ? []
        : ((categoryResult.data ?? []) as ProductCategoryRecord[]);
    const productCategories =
      (productResult.error
        ? []
        : ((productResult.data ?? []) as Array<{ category?: string | null }>))
        .map((product) => product.category?.trim() ?? "")
        .filter(Boolean);

    return {
      categories: buildFilterCategoryOptions({
        includeProductCategories: productCategories,
        records: categoryRecords,
      }),
    } satisfies ProductCategorySnapshot;
  },
  ["public-product-categories"],
  { revalidate: 300, tags: ["products"] },
);

const getHomepageDealsCached = unstable_cache(
  async () => {
    if (!hasSupabaseServerEnv) {
      return buildFallbackDeals();
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return buildFallbackDeals();
    }

    const { data, error } = await client
      .from("homepage_deals")
      .select("*, products(*)")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return buildFallbackDeals();
    }

    const dealRows = data as DealRow[];
    const missingProductIds = dealRows
      .filter((deal) => !deal.products)
      .map((deal) => Number(deal.product_id))
      .filter((productId) => Number.isFinite(productId));
    let fallbackProductsById: Record<number, ProductRecord> | undefined;

    if (missingProductIds.length > 0) {
      const { data: fallbackProductRows } = await client
        .from("products")
        .select("*")
        .in("id", missingProductIds);

      fallbackProductsById = Object.fromEntries(
        ((fallbackProductRows as ProductRecord[] | null) ?? []).map((product) => [
          Number(product.id),
          product,
        ]),
      ) as Record<number, ProductRecord>;
    }

    const mappedDeals = mapHomepageDeals(dealRows, fallbackProductsById);

    return mappedDeals.length > 0 ? mappedDeals : buildFallbackDeals();
  },
  ["public-homepage-deals"],
  { revalidate: 300, tags: ["products"] },
);

const getPublishedBlogPostsCached = unstable_cache(
  async () => {
    if (!hasSupabaseServerEnv) {
      return FALLBACK_BLOG_POSTS;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return FALLBACK_BLOG_POSTS;
    }

    const { data, error } = await client
      .from("blog_posts")
      .select("*")
      .eq("is_published", true)
      .order("published_at", { ascending: false });

    if (error || !data || data.length === 0) {
      return FALLBACK_BLOG_POSTS;
    }

    return data as BlogPostRecord[];
  },
  ["public-blog-post-list"],
  { revalidate: 300, tags: ["blog"] },
);

const getProductBySlugCached = unstable_cache(
  async (slug: string) => {
    if (!hasSupabaseServerEnv) {
      return (
        SEED_PRODUCTS.find((product) => product.slug === slug) ?? null
      ) satisfies StoreProduct | null;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return null;
    }

    const { data } = await client
      .from("products")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (data) {
      return mapProductRecord(data as ProductRecord);
    }

    const { data: fallbackRows } = await client
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    const fallbackMatch = ((fallbackRows as ProductRecord[] | null) ?? []).find((record) => {
      return mapProductRecord(record).slug === slug;
    });

    return fallbackMatch ? mapProductRecord(fallbackMatch) : null;
  },
  ["public-product-by-slug"],
  { revalidate: 300, tags: ["products"] },
);

const getBlogPostBySlugCached = unstable_cache(
  async (slug: string) => {
    if (!hasSupabaseServerEnv) {
      return FALLBACK_BLOG_POSTS.find((post) => post.slug === slug) ?? null;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return null;
    }

    const { data } = await client
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    return (data as BlogPostRecord | null) ?? null;
  },
  ["public-blog-post-by-slug"],
  { revalidate: 300, tags: ["blog"] },
);

const getRegistryByShareCodeCached = unstable_cache(
  async (shareCode: string) => {
    if (!hasSupabaseServerEnv) {
      return {
        items: [],
        registry: null,
        shippingAddress: null,
      } satisfies RegistrySnapshot;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return {
        items: [],
        registry: null,
        shippingAddress: null,
      } satisfies RegistrySnapshot;
    }

    const { data: registryRow } = await client
      .from("registries")
      .select("*")
      .eq("share_code", shareCode)
      .maybeSingle();

    const registry = (registryRow as RegistryRecord | null) ?? null;
    if (!registry) {
      return {
        items: [],
        registry: null,
        shippingAddress: null,
      } satisfies RegistrySnapshot;
    }

    const { data: itemRows } = await client
      .from("registry_items")
      .select("*, products(*)")
      .eq("registry_id", registry.id)
      .order("created_at", { ascending: false });

    let shippingAddress: ShippingAddress | null = null;

    if (hasSupabaseServiceRoleEnv) {
      const serviceRoleClient = createSupabaseServiceRoleClient();
      if (serviceRoleClient) {
        const { data: profileRow } = await serviceRoleClient
          .from("user_profiles")
          .select("shipping_address")
          .eq("id", registry.user_id)
          .maybeSingle();

        const normalizedAddress = normalizeShippingAddress(
          (
            profileRow as
              | { shipping_address?: Partial<ShippingAddress> | null }
              | null
          )?.shipping_address ?? null,
        );

        shippingAddress = hasSavedShippingAddress(normalizedAddress)
          ? normalizedAddress
          : null;
      }
    }

    return {
      items: ((itemRows as RegistryItemRecord[] | null) ?? []).map(
        mapRegistryItemRecord,
      ),
      registry,
      shippingAddress,
    } satisfies RegistrySnapshot;
  },
  ["public-registry-by-share-code"],
  { revalidate: 120, tags: ["registries"] },
);

export async function getPublicProductBySlug(slug: string) {
  return getProductBySlugCached(slug);
}

export async function getFeaturedProducts(limit: number, onlyInStock = false) {
  return getFeaturedProductsCached(limit, onlyInStock);
}

export async function getPublicProductCatalogPage(options?: {
  onlyInStock?: boolean;
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  selectedCategory?: string;
}) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 16;
  const onlyInStock = options?.onlyInStock ?? false;
  const selectedCategory = options?.selectedCategory ?? "All";
  const searchQuery = options?.searchQuery ?? "";

  return getProductCatalogPageCached(
    page,
    pageSize,
    onlyInStock,
    selectedCategory,
    searchQuery,
  );
}

export async function getHomepageDeals() {
  return getHomepageDealsCached();
}

export async function getPublicProductCategories() {
  const snapshot = await getProductCategoriesCached();
  return snapshot.categories;
}

export async function getPublishedBlogPosts() {
  return getPublishedBlogPostsCached();
}

export async function getPublishedBlogPostBySlug(slug: string) {
  const post = await getBlogPostBySlugCached(slug);
  return post ?? FALLBACK_BLOG_POSTS.find((entry) => entry.slug === slug) ?? null;
}

export async function getPublicRegistryByShareCode(shareCode: string) {
  return getRegistryByShareCodeCached(shareCode);
}
