import { notFound } from "next/navigation";

import { Footer } from "../../components/Footer";
import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import { getStoreLocationBySlug, getStoreLocations } from "../../../lib/publicData";
import { buildPageMetadata } from "../../../lib/site";
import { splitLocationOpeningHours } from "../../../lib/storeLocations";

type LocationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const locations = await getStoreLocations();
  return locations.map((location) => ({
    slug: location.slug,
  }));
}

export async function generateMetadata({ params }: LocationPageProps) {
  const { slug } = await params;
  const location = await getStoreLocationBySlug(slug);

  if (!location) {
    return buildPageMetadata({
      title: "Location Not Found",
      description: "This Nana's Baby Essentials location could not be found.",
      path: `/locations/${slug}`,
      noIndex: true,
    });
  }

  return buildPageMetadata({
    title: `${location.name} Location`,
    description:
      location.description?.trim() ||
      `${location.name} location details, opening hours, and contact information for Nana's Baby Essentials.`,
    image: location.hero_image ?? null,
    path: `/locations/${location.slug}`,
  });
}

export default async function LocationPage({ params }: LocationPageProps) {
  const { slug } = await params;
  const [location, locations] = await Promise.all([
    getStoreLocationBySlug(slug),
    getStoreLocations(),
  ]);

  if (!location) {
    notFound();
  }

  const openingHours = splitLocationOpeningHours(location.opening_hours);

  return (
    <>
      <SiteHeaderShell locations={locations} />

      <main className="min-h-screen bg-white">
        <section className="bg-gradient-to-br from-pink-50 via-white to-orange-50 py-16">
          <div className="container mx-auto px-4">
            <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div className="space-y-5">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-pink-600">
                  Our Location
                </p>
                <h1 className="text-4xl font-bold text-gray-900 md:text-5xl">
                  {location.name}
                </h1>
                <p className="text-base leading-relaxed text-gray-600 md:text-lg">
                  {location.description || "Visit us in person for baby essentials, registry support, and pickup."}
                </p>
              </div>

              <div className="overflow-hidden rounded-[32px] border border-pink-100 bg-white shadow-sm">
                <img
                  src={location.hero_image || "/logo.jpg"}
                  alt={location.name}
                  className="h-full min-h-[300px] w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-1">
                <h2 className="text-xl font-semibold text-gray-900">Visit Details</h2>
                <div className="mt-5 space-y-4 text-sm text-gray-600">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                      Address
                    </p>
                    <p className="mt-2 whitespace-pre-line">{location.address}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                      Phone
                    </p>
                    <p className="mt-2">{location.contact_phone || "Not listed yet"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                      Email
                    </p>
                    <p className="mt-2">{location.contact_email || "Not listed yet"}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
                <h2 className="text-xl font-semibold text-gray-900">Opening Hours</h2>
                {openingHours.length > 0 ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {openingHours.map((entry) => (
                      <div key={`${location.id}-${entry}`} className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        {entry}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-gray-600">
                    Opening hours will be updated here soon.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
