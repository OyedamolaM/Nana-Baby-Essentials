import { Footer } from "../components/Footer";
import { SiteHeaderShell } from "../components/SiteHeaderShell";
import { getStoreLocations } from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";
import { StoreLocationsThreeClient } from "./StoreLocationsThreeClient";

export const metadata = buildPageMetadata({
  title: "Store Locations Preview Three",
  description:
    "Comparison preview for Nana's Baby Essentials interactive store locations layout.",
  path: "/store-locations3",
  noIndex: true,
});

export default async function StoreLocationsThreePage() {
  const locations = await getStoreLocations();

  return (
    <>
      <SiteHeaderShell locations={locations} />
      <StoreLocationsThreeClient />
      <Footer />
    </>
  );
}
