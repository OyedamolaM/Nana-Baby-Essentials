import { ProductsPage } from "../pages/ProductsPage";
import { getPublicProductCatalogPage } from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Shop Baby Products",
  description:
    "Browse the Nana's Baby Essentials catalogue, filter by category, and shop premium products for newborns and growing families.",
  path: "/products",
});

export default async function ProductsRoute() {
  const { products, totalCount } = await getPublicProductCatalogPage({
    page: 1,
    pageSize: 16,
    onlyInStock: false,
    selectedCategory: "All",
    searchQuery: "",
  });

  return <ProductsPage initialProducts={products} initialTotalCount={totalCount} />;
}
