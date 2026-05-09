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

export default async function ProductsRoute() {
  const [{ products, totalCount }, initialCategories] = await Promise.all([
    getPublicProductCatalogPage({
      page: 1,
      pageSize: 16,
      onlyInStock: false,
      selectedCategory: "All",
      searchQuery: "",
    }),
    getPublicProductCategories(),
  ]);

  return (
    <ProductsPage
      initialCategories={initialCategories}
      initialProducts={products}
      initialTotalCount={totalCount}
    />
  );
}
