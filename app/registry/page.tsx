import { RegistryLandingPage } from "../pages/RegistryLandingPage";
import {
  getHomepageDeals,
  getPublicProductCatalogPage,
  getPublicProductCategories,
  getSpecialPackages,
  getStoreLocations,
} from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Baby Registry",
  description:
    "Create a baby registry, share your registry link, and add baby essentials without leaving the page.",
  path: "/registry",
});

export default async function RegistryPage() {
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
      initialCategories={initialCategories}
      initialDeals={initialDeals}
      initialProducts={initialProductPage.products}
      initialSpecialPackages={initialSpecialPackages}
      initialStoreLocations={initialStoreLocations}
      initialTotalCount={initialProductPage.totalCount}
    />
  );
}
