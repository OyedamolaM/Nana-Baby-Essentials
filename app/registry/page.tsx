import { RegistryLandingPage } from "../pages/RegistryLandingPage";
import { getPublicProductCatalogPage } from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Baby Registry",
  description:
    "Create a baby registry, share your registry link, and add baby essentials without leaving the page.",
  path: "/registry",
});

export default async function RegistryPage() {
  const initialProductPage = await getPublicProductCatalogPage({
    page: 1,
    pageSize: 16,
    onlyInStock: true,
    selectedCategory: "All",
    searchQuery: "",
  });

  return (
    <RegistryLandingPage
      initialProducts={initialProductPage.products}
      initialTotalCount={initialProductPage.totalCount}
    />
  );
}
