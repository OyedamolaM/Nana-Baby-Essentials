import { RegistryLandingPage } from "../pages/RegistryLandingPage";
import {
  getHomepageDeals,
  getPublicProductCatalogPage,
  getPublicProductCategories,
  getRegistryReviews,
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
    initialRegistryReviews,
    initialSpecialPackages,
    initialStoreLocations,
  ] = await Promise.all([
    getPublicProductCatalogPage({
      page: 1,
      pageSize: 10,
      onlyInStock: false,
      selectedCategory: "All",
      searchQuery: "",
    }),
    getPublicProductCategories(),
    getHomepageDeals(),
    getRegistryReviews(),
    getSpecialPackages(),
    getStoreLocations(),
  ]);

  return (
    <RegistryLandingPage
      initialCategories={initialCategories}
      initialDeals={initialDeals}
      initialProducts={initialProductPage.products}
      initialRegistryReviews={initialRegistryReviews}
      initialSpecialPackages={initialSpecialPackages}
      initialStoreLocations={initialStoreLocations}
      initialTotalCount={initialProductPage.totalCount}
    />
  );
}
