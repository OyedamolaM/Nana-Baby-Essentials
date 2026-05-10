import {
  ArrowRight,
  Clock3,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { notFound } from "next/navigation";

import { Footer } from "../../components/Footer";
import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import {
  getStoreLocationBySlug,
  getStoreLocations,
} from "../../../lib/publicData";
import { buildPageMetadata } from "../../../lib/site";
import { splitLocationOpeningHours } from "../../../lib/storeLocations";

type LocationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamicParams = true;

export async function generateStaticParams() {
  const locations = await getStoreLocations();

  return locations.map((location) => ({
    slug: location.slug,
  }));
}

export async function generateMetadata({
  params,
}: LocationPageProps) {
  const { slug } = await params;

  const location = await getStoreLocationBySlug(slug);

  if (!location) {
    return buildPageMetadata({
      title: "Location Not Found",
      description:
        "This Nana's Baby Essentials location could not be found.",
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

function buildLocationAddressLines(address: string) {
  const directLines = address
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (directLines.length > 1) {
    return directLines;
  }

  const commaParts = address
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (commaParts.length <= 1) {
    return directLines;
  }

  return [commaParts[0], commaParts.slice(1).join(", ")];
}

function buildOpeningHourRows(openingHours: string[]) {
  return openingHours.map((entry) => {
    const separatorIndex = entry.indexOf(":");

    if (separatorIndex === -1) {
      return {
        key: entry,
        label: "Hours",
        value: entry,
      };
    }

    const label = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();

    return {
      key: entry,
      label,
      value: value || "Closed",
    };
  });
}

function buildDirectionsUrl(address: string) {
  const normalizedAddress = address.trim();

  if (!normalizedAddress) {
    return "https://www.google.com/maps";
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    normalizedAddress,
  )}`;
}

export default async function LocationPage({
  params,
}: LocationPageProps) {
  const { slug } = await params;

  const [location, locations] = await Promise.all([
    getStoreLocationBySlug(slug),
    getStoreLocations(),
  ]);

  if (!location) {
    notFound();
  }

  const openingHours = splitLocationOpeningHours(
    location.opening_hours
  );
  const openingHourRows = buildOpeningHourRows(openingHours);
  const addressLines = buildLocationAddressLines(
    location.address
  );
  const fullAddress =
    addressLines.join(", ") ||
    location.address ||
    "Address coming soon.";
  const directionsUrl = buildDirectionsUrl(location.address);

  return (
    <>
      <SiteHeaderShell locations={locations} />

      <main className="bg-[linear-gradient(180deg,#fff_0%,#fdf7fb_48%,#fff_100%)]">
        <section className="py-8 sm:py-10 lg:py-14">
          <div className="mx-auto max-w-[1580px] px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:gap-10 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b65287]">
                    Stores
                  </p>

                  <h1 className="max-w-[12ch] text-[2.2rem] font-black leading-[0.96] tracking-[-0.06em] text-[#6d184f] sm:text-[3rem] lg:text-[3.5rem]">
                    {location.name}
                  </h1>
                </div>

                <div className="overflow-hidden rounded-[1.8rem] border border-[#eddce8] bg-white shadow-[0_32px_90px_-56px_rgba(109,24,79,0.5)]">
                  <img
                    src={location.hero_image || "/logo.jpg"}
                    alt={location.name}
                    className="aspect-[4/4.8] w-full object-cover sm:aspect-[5/4.4] xl:aspect-[4/5]"
                  />
                </div>

                <div className="rounded-[1.6rem] border border-[#eddde8] bg-white p-5 shadow-[0_20px_60px_-48px_rgba(109,24,79,0.45)] sm:p-6">
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fdf0f7] text-[#a64279]">
                      <MapPin className="h-5 w-5" />
                    </span>

                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b65287]">
                        Visit Us
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[#756a78] sm:text-base">
                        {fullAddress}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <a
                      href={directionsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-3 rounded-full bg-[#6d184f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#57113f]"
                    >
                      Get directions
                      <ArrowRight className="h-4 w-4" />
                    </a>

                    {location.contact_phone ? (
                      <a
                        href={`tel:${location.contact_phone}`}
                        className="inline-flex items-center justify-center gap-3 rounded-full border border-[#ebd8e5] bg-[#fff8fc] px-5 py-3 text-sm font-semibold text-[#8f3f75] transition hover:border-[#ddb6cc] hover:text-[#6d184f]"
                      >
                        <Phone className="h-4 w-4" />
                        Call store
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-5 sm:space-y-6">
                <section className="rounded-[1.9rem] border border-[#eddde8] bg-white p-5 shadow-[0_25px_70px_-52px_rgba(109,24,79,0.45)] sm:p-7 lg:p-8">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fdf0f7] text-[#a64279]">
                      <MapPin className="h-5 w-5" />
                    </span>

                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b65287]">
                        Store Details
                      </p>

                      <div className="mt-4 space-y-3">
                        {addressLines.length > 0 ? (
                          addressLines.map((line) => (
                            <p
                              key={`${location.id}-${line}`}
                              className="text-base leading-7 text-[#756a78] sm:text-[1.02rem]"
                            >
                              {line}
                            </p>
                          ))
                        ) : (
                          <p className="text-base text-[#756a78]">
                            Address coming soon.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.92fr)]">
                  <section className="rounded-[1.9rem] border border-[#eddde8] bg-white p-5 shadow-[0_25px_70px_-52px_rgba(109,24,79,0.45)] sm:p-7">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fdf0f7] text-[#a64279]">
                        <Clock3 className="h-5 w-5" />
                      </span>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b65287]">
                          Office Hours
                        </p>
                        <h2 className="mt-1 text-[1.6rem] font-black tracking-[-0.05em] text-[#6d184f] sm:text-[1.9rem]">
                          Opening Times
                        </h2>
                      </div>
                    </div>

                    {openingHourRows.length > 0 ? (
                      <div className="mt-6 space-y-3">
                        {openingHourRows.map((entry) => (
                          <div
                            key={`${location.id}-${entry.key}`}
                            className="grid gap-2 rounded-[1.2rem] border border-[#f1e6ee] bg-[#fcf9fc] px-4 py-3 text-[#756a78] sm:grid-cols-[minmax(0,135px)_minmax(0,1fr)] sm:items-center sm:gap-6"
                          >
                            <p className="text-sm font-semibold sm:text-[0.98rem]">
                              {entry.label}
                            </p>
                            <p className="text-sm sm:text-[0.98rem]">
                              {entry.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-5 text-sm leading-7 text-[#756a78] sm:text-base">
                        Opening hours will be updated here soon.
                      </p>
                    )}
                  </section>

                  <div className="space-y-5">
                    {(location.contact_phone ||
                      location.contact_email) && (
                      <section className="rounded-[1.9rem] border border-[#eddde8] bg-white p-5 shadow-[0_25px_70px_-52px_rgba(109,24,79,0.45)] sm:p-7">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b65287]">
                          Contact
                        </p>

                        <div className="mt-5 space-y-4">
                          {location.contact_phone ? (
                            <a
                              href={`tel:${location.contact_phone}`}
                              className="flex items-center gap-3 rounded-[1.2rem] bg-[#fcf7fb] px-4 py-4 text-sm font-medium text-[#7a6f7d] transition hover:bg-[#faeff6] hover:text-[#6d184f]"
                            >
                              <Phone className="h-4 w-4 text-[#a64279]" />
                              <span className="break-all">
                                {location.contact_phone}
                              </span>
                            </a>
                          ) : null}

                          {location.contact_email ? (
                            <a
                              href={`mailto:${location.contact_email}`}
                              className="flex items-center gap-3 rounded-[1.2rem] bg-[#fcf7fb] px-4 py-4 text-sm font-medium text-[#7a6f7d] transition hover:bg-[#faeff6] hover:text-[#6d184f]"
                            >
                              <Mail className="h-4 w-4 text-[#a64279]" />
                              <span className="break-all">
                                {location.contact_email}
                              </span>
                            </a>
                          ) : null}
                        </div>
                      </section>
                    )}

                    <section className="rounded-[1.9rem] border border-[#eddde8] bg-white p-5 shadow-[0_25px_70px_-52px_rgba(109,24,79,0.45)] sm:p-7">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b65287]">
                        About This Store
                      </p>

                      <p className="mt-4 text-sm leading-8 text-[#756a78] sm:text-base">
                        {location.description?.trim() ||
                          "Visit our store for premium baby essentials, maternity products, nursery accessories, and thoughtful gifting options for growing families."}
                      </p>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
