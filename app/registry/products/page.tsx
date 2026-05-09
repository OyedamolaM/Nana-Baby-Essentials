import { RegistryLandingPage } from "../../pages/RegistryLandingPage";
import {
  getPublicProductCatalogPage,
  getPublicProductCategories,
} from "../../../lib/publicData";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "Registry Products",
  description:
    "Browse baby registry products by category and add them to your registry cart.",
  path: "/registry/products",
});

export default async function RegistryProductsPage() {
  const [initialProductPage, initialCategories] = await Promise.all([
    getPublicProductCatalogPage({
      page: 1,
      pageSize: 16,
      onlyInStock: true,
      selectedCategory: "All",
      searchQuery: "",
    }),
    getPublicProductCategories(),
  ]);

  return (
    <RegistryLandingPage
      catalogOnly
      initialCategories={initialCategories}
      initialProducts={initialProductPage.products}
      initialTotalCount={initialProductPage.totalCount}
    />
  );
}
