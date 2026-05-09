import { HomePage } from "./pages/HomePage";
import { getFeaturedProducts, getHomepageDeals } from "../lib/publicData";
import { buildPageMetadata } from "../lib/site";

export const metadata = buildPageMetadata({
  title: "Baby Store and Registry",
  description:
    "Shop baby essentials, browse featured baby product category tabs, and start a shareable registry from Nana's Baby Essentials.",
  path: "/",
});

export default async function Page() {
  const [initialFeaturedProducts, initialDeals] = await Promise.all([
    getFeaturedProducts(8, false),
    getHomepageDeals(),
  ]);

  return (
    <HomePage
      initialFeaturedProducts={initialFeaturedProducts}
      initialDeals={initialDeals}
    />
  );
}
