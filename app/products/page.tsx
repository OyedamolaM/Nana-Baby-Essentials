import { ProductsPage } from "../pages/ProductsPage";
import {
  getPublicProductCatalogPage,
  getPublicProductCategories,
} from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Shop Baby Products",
  description:
    "Browse the Nana's Baby Essentials catalogue, filter by category, and shop premium products for newborns and growing families.",
  path: "/products",
});

type ProductsRouteProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsRoute({ searchParams }: ProductsRouteProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialFocusSearch = resolvedSearchParams.focusSearch === "1";
  const initialSelectedCategory = readSearchParam(resolvedSearchParams.category)?.trim() || "All";
  const initialSearchQuery = readSearchParam(resolvedSearchParams.query)?.trim() || "";
  const initialFeaturedOnly = readSearchParam(resolvedSearchParams.featured) === "1";
  const initialView = initialFeaturedOnly
    ? "best-sellers"
    : readSearchParam(resolvedSearchParams.view) === "new-arrivals"
      ? "new-arrivals"
      : "all";
  const [{ products, totalCount }, initialCategories] = await Promise.all([
    getPublicProductCatalogPage({
      featuredOnly: initialFeaturedOnly,
      page: 1,
      pageSize: 10,
      onlyInStock: false,
      selectedCategory: initialSelectedCategory,
      searchQuery: initialSearchQuery,
    }),
    getPublicProductCategories(),
  ]);
  const nextCategories =
    initialSelectedCategory !== "All" &&
    !initialCategories.includes(initialSelectedCategory)
      ? ["All", initialSelectedCategory, ...initialCategories.filter((category) => category !== "All")]
      : initialCategories;

  return (
    <ProductsPage
      initialFeaturedOnly={initialFeaturedOnly}
      initialFocusSearch={initialFocusSearch}
      initialCategories={nextCategories}
      initialProducts={products}
      initialSearchQuery={initialSearchQuery}
      initialSelectedCategory={initialSelectedCategory}
      initialTotalCount={totalCount}
      initialView={initialView}
    />
  );
}
