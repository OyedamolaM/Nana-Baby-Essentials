import { RegistryLandingPage } from "../pages/RegistryLandingPage";
import {
  getPublicProductCatalogPage,
  getPublicProductCategories,
} from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Baby Registry",
  description:
    "Create a baby registry, share your registry link, and add baby essentials without leaving the page.",
  path: "/registry",
});

export default async function RegistryPage() {
  const [initialProductPage, initialCategories] = await Promise.all([
    getPublicProductCatalogPage({
      page: 1,
      pageSize: 20,
      onlyInStock: false,
      selectedCategory: "All",
      searchQuery: "",
    }),
    getPublicProductCategories(),
  ]);

  return (
    <RegistryLandingPage
      initialCategories={initialCategories}
      initialProducts={initialProductPage.products}
      initialTotalCount={initialProductPage.totalCount}
    />
  );
}
