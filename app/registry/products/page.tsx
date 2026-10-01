import { RegistryLandingPage } from "../../pages/RegistryLandingPage";
import {
  getHomepageDeals,
  getPublicProductCatalogPage,
  getPublicProductCategories,
  getSpecialPackages,
  getStoreLocations,
} from "../../../lib/publicData";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "Registry Products",
  description:
    "Browse baby registry products by category and add them to your registry cart.",
  path: "/registry/products",
});

export default async function RegistryProductsPage() {
  const [
    initialProductPage,
    initialCategories,
    initialDeals,
    initialSpecialPackages,
    initialStoreLocations,
  ] = await Promise.all([
    getPublicProductCatalogPage({
      page: 1,
      pageSize: 20,
      onlyInStock: false,
      selectedCategory: "All",
      searchQuery: "",
    }),
    getPublicProductCategories(),
    getHomepageDeals(),
    getSpecialPackages(),
    getStoreLocations(),
  ]);

  return (
    <RegistryLandingPage
      catalogOnly
      initialCategories={initialCategories}
      initialDeals={initialDeals}
      initialProducts={initialProductPage.products}
      initialSpecialPackages={initialSpecialPackages}
      initialStoreLocations={initialStoreLocations}
      initialTotalCount={initialProductPage.totalCount}
    />
  );
}
