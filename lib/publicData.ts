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
  extractAssignedCategoryLabel,
  normalizeProductCategoryLabels,
  type ProductCategoryAssignmentRecord,
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
import {
  buildHomepageReviews,
  buildHomepageSiteContent,
  DEFAULT_HOMEPAGE_REVIEWS,
  type HomepageReview,
  type HomepageReviewRecord,
  type HomepageSiteContent,
  type SiteContentSettingRecord,
} from "./siteContent";
import {
  isSpecialPackage,
  mapSpecialPackageRecord,
  type SpecialPackage,
  type SpecialPackageRecord,
} from "./specialPackages";
import { type StoreLocationRecord } from "./storeLocations";

function buildProductLookup(records: ProductRecord[] | null | undefined) {
  return Object.fromEntries(
    (records ?? []).map((product) => [Number(product.id), product]),
  ) as Record<number, ProductRecord>;
}

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

type SpecialPackageSnapshot = {
  packages: SpecialPackage[];
};

type StoreLocationSnapshot = {
  locations: StoreLocationRecord[];
};

function filterSeedProducts(
  products: StoreProduct[],
  featuredOnly: boolean,
  selectedCategory: string,
  searchQuery: string,
) {
  return products.filter((product) => {
    const matchesFeatured = !featuredOnly || product.isFeatured;
    const matchesCategory =
      selectedCategory === "All" ||
      normalizeProductCategoryLabels(product.category, product.categories).includes(
        selectedCategory,
      );
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch =
      normalizedQuery === "" ||
      product.name.toLowerCase().includes(normalizedQuery) ||
      product.description.toLowerCase().includes(normalizedQuery);

    return matchesFeatured && matchesCategory && matchesSearch;
  });
}

function applyProductCategoryAssignments(
  records: ProductRecord[],
  assignments: ProductCategoryAssignmentRecord[],
) {
  const assignmentsByProductId = assignments.reduce<Record<number, string[]>>(
    (accumulator, assignment) => {
      const label = extractAssignedCategoryLabel(assignment);
      if (!label) {
        return accumulator;
      }

      const productId = Number(assignment.product_id);
      const existing = accumulator[productId] ?? [];
      existing.push(label);
      accumulator[productId] = existing;
      return accumulator;
    },
    {},
  );

  return records.map((record) => ({
    ...record,
    categories: normalizeProductCategoryLabels(
      record.category,
      assignmentsByProductId[Number(record.id)],
    ),
  }));
}

async function getProductCategoryAssignmentsForProducts(
  client: ReturnType<typeof createSupabaseServerClient>,
  productIds: number[],
) {
  if (!client || productIds.length === 0) {
    return [] as ProductCategoryAssignmentRecord[];
  }

  const { data, error } = await client
    .from("product_category_assignments")
    .select("product_id, category_id, product_categories(label, sort_order, is_active)")
    .in("product_id", productIds);

  if (error?.code === "42P01") {
    return [] as ProductCategoryAssignmentRecord[];
  }

  if (error || !data) {
    return [] as ProductCategoryAssignmentRecord[];
  }

  return data as ProductCategoryAssignmentRecord[];
}

async function getProductIdsForSelectedCategory(
  client: ReturnType<typeof createSupabaseServerClient>,
  selectedCategory: string,
) {
  if (!client || selectedCategory === "All") {
    return null as number[] | null;
  }

  const { data: categoryRows, error: categoryError } = await client
    .from("product_categories")
    .select("id")
    .eq("label", selectedCategory)
    .limit(1);

  if (categoryError?.code === "42P01") {
    return null;
  }

  if (categoryError || !categoryRows?.length) {
    return [] as number[];
  }

  const categoryId = categoryRows[0]?.id;
  if (!categoryId) {
    return [] as number[];
  }

  const { data: assignmentRows, error: assignmentError } = await client
    .from("product_category_assignments")
    .select("product_id")
    .eq("category_id", categoryId);

  if (assignmentError?.code === "42P01") {
    return null;
  }

  if (assignmentError || !assignmentRows) {
    return [] as number[];
  }

  return Array.from(
    new Set(
      assignmentRows
        .map((assignment) => Number(assignment.product_id))
        .filter((productId) => Number.isFinite(productId)),
    ),
  );
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

function mapHomepageDeals(data: HomeDealRecord[], productsById?: Record<number, ProductRecord>) {
  return data
    .filter((deal) => isDealActive(deal))
    .flatMap((deal) => {
      const productRecord = productsById?.[Number(deal.product_id)] ?? null;
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
      .eq("product_kind", "standard")
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
    featuredOnly: boolean,
    selectedCategory: string,
    searchQuery: string,
  ) => {
    const fallbackBase = onlyInStock
      ? SEED_PRODUCTS.filter((product) => product.inStock)
      : SEED_PRODUCTS;
    const fallbackFiltered = filterSeedProducts(
      fallbackBase,
      featuredOnly,
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
      .eq("product_kind", "standard")
      .order("created_at", { ascending: false });

    if (onlyInStock) {
      query = query.eq("in_stock", true);
    }

    if (featuredOnly) {
      query = query.eq("is_featured", true);
    }

    if (selectedCategory !== "All") {
      const matchingProductIds = await getProductIdsForSelectedCategory(
        client,
        selectedCategory,
      );

      if (matchingProductIds === null) {
        query = query.eq("category", selectedCategory);
      } else if (matchingProductIds.length === 0) {
        return {
          products: [],
          totalCount: 0,
        } satisfies ProductCatalogSnapshot;
      } else {
        query = query.in("id", matchingProductIds);
      }
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

    const productRows = data as ProductRecord[];
    const assignments = await getProductCategoryAssignmentsForProducts(
      client,
      productRows.map((product) => Number(product.id)),
    );
    const enrichedProducts = applyProductCategoryAssignments(productRows, assignments);

    return {
      products: enrichedProducts.map(mapProductRecord),
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
      client
        .from("products")
        .select("category")
        .eq("product_kind", "standard")
        .order("created_at", { ascending: false }),
    ]);

    const categoryRecords =
      categoryResult.error?.code === "42P01"
        ? []
        : ((categoryResult.data ?? []) as ProductCategoryRecord[]);
    const productCategories =
      (productResult.error
        ? []
        : ((productResult.data ?? []) as Array<{
            categories?: string[] | null;
            category?: string | null;
          }>))
        .flatMap((product) =>
          normalizeProductCategoryLabels(product.category, product.categories),
        );

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
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return buildFallbackDeals();
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
      const { data: productRows } = await client
        .from("products")
        .select("*")
        .eq("product_kind", "standard")
        .in("id", productIds);

      productsById = buildProductLookup((productRows as ProductRecord[] | null) ?? []);
    }

    const mappedDeals = mapHomepageDeals(dealRows, productsById);

    return mappedDeals.length > 0 ? mappedDeals : buildFallbackDeals();
  },
  ["public-homepage-deals"],
  { revalidate: 300, tags: ["products"] },
);

const getHomepageSiteContentCached = unstable_cache(
  async () => {
    if (!hasSupabaseServerEnv) {
      return buildHomepageSiteContent([]);
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return buildHomepageSiteContent([]);
    }

    const { data, error } = await client
      .from("site_content_settings")
      .select("*")
      .in("key", ["hero_image", "about_images"]);

    if (error?.code === "42P01" || error || !data) {
      return buildHomepageSiteContent([]);
    }

    return buildHomepageSiteContent(data as SiteContentSettingRecord[]);
  },
  ["homepage-site-content"],
  { revalidate: 300, tags: ["content"] },
);

const getHomepageReviewsCached = unstable_cache(
  async () => {
    if (!hasSupabaseServerEnv) {
      return DEFAULT_HOMEPAGE_REVIEWS;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return DEFAULT_HOMEPAGE_REVIEWS;
    }

    const { data, error } = await client
      .from("homepage_reviews")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error?.code === "42P01" || error || !data) {
      return DEFAULT_HOMEPAGE_REVIEWS;
    }

    return buildHomepageReviews(data as HomepageReviewRecord[]);
  },
  ["homepage-reviews"],
  { revalidate: 300, tags: ["content"] },
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
      .eq("product_kind", "standard")
      .eq("slug", slug)
      .maybeSingle();

    if (data) {
      return mapProductRecord(data as ProductRecord);
    }

    const { data: fallbackRows } = await client
      .from("products")
      .select("*")
      .eq("product_kind", "standard")
      .order("created_at", { ascending: false });

    const fallbackMatch = ((fallbackRows as ProductRecord[] | null) ?? []).find((record) => {
      return mapProductRecord(record).slug === slug;
    });

    return fallbackMatch ? mapProductRecord(fallbackMatch) : null;
  },
  ["public-product-by-slug"],
  { revalidate: 300, tags: ["products"] },
);

const getSpecialPackagesCached = unstable_cache(
  async () => {
    if (!hasSupabaseServerEnv) {
      return {
        packages: [],
      } satisfies SpecialPackageSnapshot;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return {
        packages: [],
      } satisfies SpecialPackageSnapshot;
    }

    const { data, error } = await client
      .from("special_packages")
      .select("*, products(*)")
      .eq("is_active", true)
      .order("package_type", { ascending: false })
      .order("sort_order", { ascending: true });

    if (error?.code === "42P01" || error || !data) {
      return {
        packages: [],
      } satisfies SpecialPackageSnapshot;
    }

    return {
      packages: ((data as SpecialPackageRecord[] | null) ?? [])
        .map((record) => mapSpecialPackageRecord(record))
        .filter(isSpecialPackage),
    } satisfies SpecialPackageSnapshot;
  },
  ["public-special-packages"],
  { revalidate: 300, tags: ["packages"] },
);

const getStoreLocationsCached = unstable_cache(
  async () => {
    if (!hasSupabaseServerEnv) {
      return {
        locations: [],
      } satisfies StoreLocationSnapshot;
    }

    const client = createSupabaseServerClient();
    if (!client) {
      return {
        locations: [],
      } satisfies StoreLocationSnapshot;
    }

    const { data, error } = await client
      .from("store_locations")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error?.code === "42P01" || error || !data) {
      return {
        locations: [],
      } satisfies StoreLocationSnapshot;
    }

    return {
      locations: (data as StoreLocationRecord[] | null) ?? [],
    } satisfies StoreLocationSnapshot;
  },
  ["public-store-locations"],
  { revalidate: 300, tags: ["locations"] },
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
  featuredOnly?: boolean;
  onlyInStock?: boolean;
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  selectedCategory?: string;
}) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;
  const featuredOnly = options?.featuredOnly ?? false;
  const onlyInStock = options?.onlyInStock ?? false;
  const selectedCategory = options?.selectedCategory ?? "All";
  const searchQuery = options?.searchQuery ?? "";

  return getProductCatalogPageCached(
    page,
    pageSize,
    onlyInStock,
    featuredOnly,
    selectedCategory,
    searchQuery,
  );
}

export async function getHomepageDeals() {
  return getHomepageDealsCached();
}

export async function getHomepageSiteContent(): Promise<HomepageSiteContent> {
  return getHomepageSiteContentCached();
}

export async function getHomepageReviews(): Promise<HomepageReview[]> {
  return getHomepageReviewsCached();
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

export async function getSpecialPackages(): Promise<SpecialPackage[]> {
  const snapshot = await getSpecialPackagesCached();
  return snapshot.packages;
}

export async function getStoreLocations() {
  const snapshot = await getStoreLocationsCached();
  return snapshot.locations;
}

export async function getStoreLocationBySlug(slug: string) {
  const snapshot = await getStoreLocationsCached();
  return snapshot.locations.find((location) => location.slug === slug) ?? null;
}

export async function getPublicRegistryByShareCode(shareCode: string) {
  return getRegistryByShareCodeCached(shareCode);
}
