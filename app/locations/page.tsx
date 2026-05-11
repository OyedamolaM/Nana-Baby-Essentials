import { Footer } from "../components/Footer";
import { SiteHeaderShell } from "../components/SiteHeaderShell";
import { getStoreLocations } from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";
import { LocationsPageClient } from "./LocationsPageClient";

type LocationsPageProps = {
  searchParams: Promise<{
    location?: string | string[];
  }>;
};

export const metadata = buildPageMetadata({
  title: "Store Locations",
  description:
    "Explore Nana's Baby Essentials store locations, opening hours, contact details, and directions.",
  path: "/locations",
});

export default async function LocationsPage({
  searchParams,
}: LocationsPageProps) {
  const locations = await getStoreLocations();
  const locationParam = (await searchParams).location;
  const initialSlug = Array.isArray(locationParam)
    ? locationParam[0]
    : locationParam;

  return (
    <>
      <SiteHeaderShell locations={locations} />
      <LocationsPageClient
        initialSlug={initialSlug}
        locations={locations}
      />
      <Footer />
    </>
  );
}
