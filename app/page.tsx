import { HomePage } from "./pages/HomePage";
import {
  getHomepageDeals,
  getHomepageReviews,
  getHomepageSiteContent,
  getPublicProductCatalogPage,
  getPublicProductCategories,
  getSpecialPackages,
  getStoreLocations,
} from "../lib/publicData";
import { buildPageMetadata } from "../lib/site";

export const metadata = buildPageMetadata({
  title: "Baby Store and Registry",
  description:
    "Shop baby essentials, browse featured baby product category tabs, and start a shareable registry from Nana's Baby Essentials.",
  path: "/",
});

export default async function Page() {
  const [
    initialProductPage,
    initialDeals,
    initialProductCategories,
    initialHomepageSiteContent,
    initialHomepageReviews,
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
    getHomepageDeals(),
    getPublicProductCategories(),
    getHomepageSiteContent(),
    getHomepageReviews(),
    getSpecialPackages(),
    getStoreLocations(),
  ]);

  return (
    <HomePage
      initialDeals={initialDeals}
      initialHomepageReviews={initialHomepageReviews}
      initialHomepageSiteContent={initialHomepageSiteContent}
      initialProductCategories={initialProductCategories}
      initialProducts={initialProductPage.products}
      initialProductTotalCount={initialProductPage.totalCount}
      initialSpecialPackages={initialSpecialPackages}
      initialStoreLocations={initialStoreLocations}
    />
  );
}
