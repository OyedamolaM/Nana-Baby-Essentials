"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Clock,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import {
  FaInstagram,
  FaTiktok,
  FaWhatsapp,
} from "react-icons/fa";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "../components/ui/carousel";
import {
  splitLocationOpeningHours,
  type StoreLocationRecord,
} from "../../lib/storeLocations";

type DisplayLocation = {
  address: string;
  city: string;
  email: string | null;
  hours: [string, string][];
  id: string;
  image: string;
  mapQuery: string;
  name: string;
  phone: string | null;
  slug: string;
  whatsappPhone: string | null;
};

const INSTAGRAM_URL = "https://www.instagram.com/nanasbabyessentials";
const TIKTOK_URL = "https://www.tiktok.com/nanasbabyshop";

function buildDirectionsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address,
  )}`;
}

function buildPhoneUrl(phone: string) {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

function sanitizeWhatsAppNumber(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function buildWhatsAppUrl(storeName: string, phone: string) {
  const enquiryMessage = `Hello Nana's Baby Essentials, I would like to make an enquiry about ${storeName}.`;

  return `https://wa.me/${sanitizeWhatsAppNumber(phone)}?text=${encodeURIComponent(
    enquiryMessage,
  )}`;
}

function deriveLocationCity(location: StoreLocationRecord) {
  const segments = location.address
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (segments.length > 0) {
    return segments[segments.length - 1] ?? location.name;
  }

  return location.name;
}

function buildHours(value?: string | null) {
  const rows = splitLocationOpeningHours(value);

  return rows.map((entry) => {
    const separatorIndex = entry.indexOf(":");

    if (separatorIndex === -1) {
      return ["Hours", entry] as [string, string];
    }

    const day = entry.slice(0, separatorIndex).trim();
    const time = entry.slice(separatorIndex + 1).trim();

    return [day || "Hours", time || "Closed"] as [string, string];
  });
}

function normalizeLocations(locations: StoreLocationRecord[]): DisplayLocation[] {
  return locations.map((location) => ({
    address: location.address?.trim() || "Address coming soon.",
    city: deriveLocationCity(location),
    email: location.contact_email?.trim() || null,
    hours: buildHours(location.opening_hours),
    id: location.id,
    image: location.hero_image?.trim() || "/logo.jpg",
    mapQuery: location.address?.trim() || location.name,
    name: location.name,
    phone: location.contact_phone?.trim() || null,
    slug: location.slug,
    whatsappPhone:
      location.whatsapp_phone?.trim() ||
      location.contact_phone?.trim() ||
      null,
  }));
}

function LocationFacts({ store }: { store: DisplayLocation }) {
  return (
    <>
      <div className="space-y-4 text-neutral-700">
        <p className="flex items-start gap-3">
          <MapPin className="mt-1 h-5 w-5 shrink-0 text-pink-500" />
          <span>{store.address}</span>
        </p>

        {store.phone ? (
          <a
            href={buildPhoneUrl(store.phone)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 transition hover:text-pink-600"
          >
            <Phone className="h-5 w-5 shrink-0 text-pink-500" />
            <span>{store.phone}</span>
          </a>
        ) : null}

        {store.email ? (
          <a
            href={`mailto:${store.email}`}
            className="flex items-center gap-3 transition hover:text-pink-600"
          >
            <Mail className="h-5 w-5 shrink-0 text-pink-500" />
            <span className="break-all">{store.email}</span>
          </a>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {store.whatsappPhone ? (
            <a
              href={buildWhatsAppUrl(store.name, store.whatsappPhone)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#fff0f7] text-[#b65287] transition hover:bg-[#f8dceb]"
              aria-label={`Send a WhatsApp enquiry about ${store.name}`}
            >
              <FaWhatsapp className="h-4 w-4" />
            </a>
          ) : null}
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#fff0f7] text-[#b65287] transition hover:bg-[#f8dceb]"
            aria-label="Visit Nana's Baby Essentials on Instagram"
          >
            <FaInstagram className="h-4 w-4" />
          </a>
          <a
            href={TIKTOK_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#fff0f7] text-[#b65287] transition hover:bg-[#f8dceb]"
            aria-label="Visit Nana's Baby Essentials on TikTok"
          >
            <FaTiktok className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="border-t border-neutral-200 pt-4">
        <p className="flex items-center gap-2 font-medium text-neutral-900">
          <Clock className="h-5 w-5 text-pink-500" />
          Opening Hours
        </p>

        {store.hours.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm text-neutral-600">
            {store.hours.map(([day, time], index) => (
              <li
                key={`${store.id}-${day}-${index}`}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-neutral-700">{day}</span>
                <span className="text-neutral-500 sm:text-right">{time}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">
            Opening hours will be updated here soon.
          </p>
        )}
      </div>
    </>
  );
}

function LocationContactFacts({ store }: { store: DisplayLocation }) {
  return (
    <div className="space-y-4 text-neutral-700">
      {store.phone ? (
        <a
          href={buildPhoneUrl(store.phone)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 transition hover:text-pink-600"
        >
          <Phone className="h-5 w-5 shrink-0 text-pink-500" />
          <span>{store.phone}</span>
        </a>
      ) : null}

      {store.email ? (
        <a
          href={`mailto:${store.email}`}
          className="flex items-center gap-3 transition hover:text-pink-600"
        >
          <Mail className="h-5 w-5 shrink-0 text-pink-500" />
          <span className="break-all">{store.email}</span>
        </a>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {store.whatsappPhone ? (
          <a
            href={buildWhatsAppUrl(store.name, store.whatsappPhone)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#fff0f7] text-[#b65287] transition hover:bg-[#f8dceb]"
            aria-label={`Send a WhatsApp enquiry about ${store.name}`}
          >
            <FaWhatsapp className="h-4 w-4" />
          </a>
        ) : null}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#fff0f7] text-[#b65287] transition hover:bg-[#f8dceb]"
          aria-label="Visit Nana's Baby Essentials on Instagram"
        >
          <FaInstagram className="h-4 w-4" />
        </a>
        <a
          href={TIKTOK_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#fff0f7] text-[#b65287] transition hover:bg-[#f8dceb]"
          aria-label="Visit Nana's Baby Essentials on TikTok"
        >
          <FaTiktok className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

function MobileDetailCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-rose-100 bg-[#fffafb] p-5 shadow-[0_18px_50px_-42px_rgba(0,0,0,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b65287]">
        {title}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MobileLocationSlide({ store }: { store: DisplayLocation }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-rose-100 bg-white shadow-[0_28px_80px_-56px_rgba(0,0,0,0.4)]">
      <div className="relative h-64">
        <Image
          src={store.image}
          alt={store.name}
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
        <div className="absolute bottom-5 left-5 right-5 text-white">
          <h2 className="text-3xl font-medium tracking-tight">
            {store.name}
          </h2>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <MobileDetailCard title="Visit Us">
          <div className="flex items-start gap-3 text-sm leading-7 text-neutral-700">
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-pink-500" />
            <span>{store.address}</span>
          </div>
        </MobileDetailCard>

        {(store.phone || store.email) ? (
          <MobileDetailCard title="Contact">
            <LocationContactFacts store={store} />
          </MobileDetailCard>
        ) : null}

        <MobileDetailCard title="Opening Hours">
          <div className="border-0 pt-0">
            {store.hours.length > 0 ? (
              <ul className="space-y-3 text-sm text-neutral-600">
                {store.hours.map(([day, time], index) => (
                  <li
                    key={`${store.id}-mobile-${day}-${index}`}
                    className="flex justify-between gap-4 rounded-2xl bg-white px-4 py-3"
                  >
                    <span>{day}</span>
                    <span className="text-right text-neutral-500">{time}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">
                Opening hours will be updated here soon.
              </p>
            )}
          </div>
        </MobileDetailCard>

        <MobileDetailCard title="Directions">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-neutral-200">
              <iframe
                src={`https://www.google.com/maps?q=${encodeURIComponent(
                  store.mapQuery,
                )}&output=embed`}
                title={`${store.name} map`}
                className="h-56 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <a
              href={buildDirectionsUrl(store.address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-pink-500"
            >
              Get directions
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </MobileDetailCard>
      </div>
    </div>
  );
}

export function LocationsPageClient({
  initialSlug,
  locations,
}: {
  initialSlug?: string;
  locations: StoreLocationRecord[];
}) {
  const stores = useMemo(() => normalizeLocations(locations), [locations]);
  const initialIndex = useMemo(() => {
    if (stores.length === 0) {
      return 0;
    }

    const matchingIndex = stores.findIndex(
      (store) => store.slug === initialSlug,
    );

    return matchingIndex >= 0 ? matchingIndex : 0;
  }, [initialSlug, stores]);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [mobileApi, setMobileApi] = useState<CarouselApi>();

  useEffect(() => {
    if (!mobileApi || stores.length === 0) {
      return;
    }

    const syncMobileSelection = () => {
      setActiveIndex(mobileApi.selectedScrollSnap());
    };

    mobileApi.scrollTo(initialIndex, true);
    syncMobileSelection();
    mobileApi.on("select", syncMobileSelection);
    mobileApi.on("reInit", syncMobileSelection);

    return () => {
      mobileApi.off("select", syncMobileSelection);
      mobileApi.off("reInit", syncMobileSelection);
    };
  }, [initialIndex, mobileApi, stores.length]);

  const active = stores[activeIndex] ?? stores[0] ?? null;

  if (!active) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#fff8fb_42%,#fff_100%)]">
        <section className="mx-auto max-w-4xl px-6 pb-24 pt-24 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-[#b65287]">
            Visit Us
          </p>
          <h1 className="mt-4 text-[30px] font-light tracking-tight text-neutral-900 sm:text-5xl md:text-6xl">
            Our Stores
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-neutral-600">
            Store locations will appear here as soon as they are added
            from the admin panel.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#fff8fb_42%,#fff_100%)]">
      <section className="mx-auto max-w-7xl px-6 pb-10 pt-10 sm:pt-16 lg:pt-20">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="max-w-4xl">
            <h1 className="text-[30px] font-light tracking-tight text-neutral-900 sm:text-5xl md:text-6xl">
              Find a{" "}
              <span className="font-serif font-medium italic text-[#b65287]">
                Nana
              </span>{" "}
                baby store close to you
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-neutral-500">
              Visit any of our locations to explore our wide range of baby products
            </p>
          </div>
          <p className="text-sm text-neutral-400">
            {stores.length} locations
          </p>
        </div>
      </section>

      <section className="lg:hidden">
        <div className="mx-auto max-w-7xl px-6 pb-24">
          <Carousel
            className="px-1"
            opts={{ align: "start", loop: stores.length > 1 }}
            setApi={setMobileApi}
          >
            <CarouselContent>
              {stores.map((store) => (
                <CarouselItem key={store.id}>
                  <MobileLocationSlide store={store} />
                </CarouselItem>
              ))}
            </CarouselContent>

            {stores.length > 1 ? (
              <>
                <CarouselPrevious className="-left-2 top-[11rem] size-9 border-rose-200 bg-white text-[#b65287] shadow-sm" />
                <CarouselNext className="-right-2 top-[11rem] size-9 border-rose-200 bg-white text-[#b65287] shadow-sm" />
              </>
            ) : null}
          </Carousel>

          {stores.length > 1 ? (
            <div className="mt-5 flex justify-center gap-2">
              {stores.map((store, index) => (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => mobileApi?.scrollTo(index)}
                  className={`h-2.5 rounded-full transition-all ${
                    activeIndex === index
                      ? "w-8 bg-[#b65287]"
                      : "w-2.5 bg-rose-200"
                  }`}
                  aria-label={`View ${store.name}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="hidden lg:block">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 pb-24 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            {stores.map((store, index) => (
              <button
                key={store.id}
                onClick={() => setActiveIndex(index)}
                className={`w-full rounded-[1.6rem] border p-5 text-left transition-all ${
                  activeIndex === index
                    ? "border-[#e7bdd1] bg-[linear-gradient(135deg,#fff6fa_0%,#fdf0f7_100%)] text-[#6d184f] shadow-[0_24px_60px_-44px_rgba(182,82,135,0.45)]"
                    : "border-neutral-200 bg-white hover:border-[#d7b0c4]"
                }`}
              >
                <p
                  className={`text-xs uppercase tracking-[0.22em] ${
                    activeIndex === index
                      ? "text-[#b65287]"
                      : "text-[#b65287]"
                  }`}
                >
                  {store.city}
                </p>
                <p className="mt-1 text-[1.45rem] font-medium tracking-tight text-neutral-900">
                  {store.name}
                </p>
                <p
                  className={`mt-2 text-sm ${
                    activeIndex === index
                      ? "text-[#7f5d71]"
                      : "text-neutral-500"
                  }`}
                >
                  {store.address}
                </p>
              </button>
            ))}
          </aside>

          <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_36px_100px_-60px_rgba(0,0,0,0.45)]">
            <div className="relative h-80">
              <Image
                src={active.image}
                alt={active.name}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-8 left-8 text-white">
                <h2 className="text-5xl font-medium tracking-tight">
                  {active.name}
                </h2>
              </div>
            </div>

            <div className="grid gap-8 p-8 xl:grid-cols-[0.96fr_1.04fr]">
              <div className="space-y-6">
                <LocationFacts store={active} />

                <a
                  href={buildDirectionsUrl(active.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-pink-500"
                >
                  Get directions
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>

              <div className="min-h-[340px] overflow-hidden rounded-2xl border border-neutral-200">
                <iframe
                  key={active.id}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(
                    active.mapQuery,
                  )}&output=embed`}
                  title={`${active.name} map`}
                  className="h-full min-h-[340px] w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
