import { HomePage } from "./pages/HomePage";
import {
  getHomepageDeals,
  getPublicProductCatalogPage,
  getPublicProductCategories,
} from "../lib/publicData";
import { buildPageMetadata } from "../lib/site";

export const metadata = buildPageMetadata({
  title: "Baby Store and Registry",
  description:
    "Shop baby essentials, browse featured baby product category tabs, and start a shareable registry from Nana's Baby Essentials.",
  path: "/",
});

export default async function Page() {
  const [initialProductPage, initialDeals, initialProductCategories] = await Promise.all([
    getPublicProductCatalogPage({
      page: 1,
      pageSize: 20,
      onlyInStock: false,
      selectedCategory: "All",
      searchQuery: "",
    }),
    getHomepageDeals(),
    getPublicProductCategories(),
  ]);

  return (
    <HomePage
      initialDeals={initialDeals}
      initialProductCategories={initialProductCategories}
      initialProducts={initialProductPage.products}
      initialProductTotalCount={initialProductPage.totalCount}
    />
  );
}
