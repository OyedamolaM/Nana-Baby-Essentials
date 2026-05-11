"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Clock,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "../components/ui/carousel";

type PreviewStore = {
  id: number;
  name: string;
  city: string;
  image: string;
  address: string;
  phone: string;
  email: string;
  hours: [string, string][];
  mapQuery: string;
};

const stores: PreviewStore[] = [
  {
    id: 1,
    name: "Surulere Store",
    city: "Lagos",
    image:
      "https://images.unsplash.com/photo-1555529771-7888783a18d3?auto=format&fit=crop&w=1200&q=80",
    address: "71, Ogunlana Drive, Surulere, Lagos",
    phone: "+234 801 234 5678",
    email: "lagos@nanababyessentials.com",
    hours: [
      ["Mon - Fri", "9:00 AM - 7:00 PM"],
      ["Saturday", "10:00 AM - 8:00 PM"],
      ["Sunday", "12:00 PM - 5:00 PM"],
    ],
    mapQuery: "Surulere Lagos",
  },
  {
    id: 2,
    name: "Wuse 2 Boutique",
    city: "Abuja",
    image:
      "https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=1200&q=80",
    address: "Plot 25, Aminu Kano Crescent, Wuse 2, Abuja",
    phone: "+234 802 345 6789",
    email: "abuja@nanababyessentials.com",
    hours: [
      ["Mon - Fri", "9:00 AM - 7:00 PM"],
      ["Saturday", "10:00 AM - 8:00 PM"],
      ["Sunday", "Closed"],
    ],
    mapQuery: "Wuse 2 Abuja",
  },
  {
    id: 3,
    name: "GRA Showroom",
    city: "Port Harcourt",
    image:
      "https://images.unsplash.com/photo-1617331721458-bd3bd3f9c7f8?auto=format&fit=crop&w=1200&q=80",
    address: "8 Evo Road, GRA Phase 2, Port Harcourt",
    phone: "+234 803 456 7890",
    email: "ph@nanababyessentials.com",
    hours: [
      ["Mon - Sat", "10:00 AM - 7:00 PM"],
      ["Sunday", "Closed"],
    ],
    mapQuery: "GRA Phase 2 Port Harcourt",
  },
];

function buildDirectionsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address,
  )}`;
}

function StoreFacts({ store }: { store: PreviewStore }) {
  return (
    <>
      <div className="space-y-4 text-neutral-700">
        <p className="flex items-start gap-3">
          <MapPin className="mt-1 h-5 w-5 shrink-0 text-pink-500" />
          <span>{store.address}</span>
        </p>
        <p className="flex items-center gap-3">
          <Phone className="h-5 w-5 shrink-0 text-pink-500" />
          <span>{store.phone}</span>
        </p>
        <p className="flex items-center gap-3">
          <Mail className="h-5 w-5 shrink-0 text-pink-500" />
          <span className="break-all">{store.email}</span>
        </p>
      </div>

      <div className="border-t border-neutral-200 pt-4">
        <p className="flex items-center gap-2 font-medium text-neutral-900">
          <Clock className="h-5 w-5 text-pink-500" />
          Opening Hours
        </p>
        <ul className="mt-3 space-y-2 text-sm text-neutral-600">
          {store.hours.map(([day, time]) => (
            <li key={day} className="flex justify-between gap-4">
              <span>{day}</span>
              <span className="text-right text-neutral-500">{time}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function MobileStoreSlide({ store }: { store: PreviewStore }) {
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
        <div className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-[#b65287] backdrop-blur">
          {store.city}
        </div>
        <div className="absolute bottom-5 left-5 right-5 text-white">
          <h2 className="font-brand text-3xl font-semibold tracking-tight">
            {store.name}
          </h2>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <StoreFacts store={store} />

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
    </div>
  );
}

export function StoreLocationsThreeClient() {
  const [active, setActive] = useState<PreviewStore>(stores[0]);
  const [mobileApi, setMobileApi] = useState<CarouselApi>();
  const [mobileIndex, setMobileIndex] = useState(0);

  useEffect(() => {
    if (!mobileApi) {
      return;
    }

    const syncMobileSelection = () => {
      const nextIndex = mobileApi.selectedScrollSnap();
      setMobileIndex(nextIndex);
      setActive(stores[nextIndex] ?? stores[0]);
    };

    syncMobileSelection();
    mobileApi.on("select", syncMobileSelection);
    mobileApi.on("reInit", syncMobileSelection);

    return () => {
      mobileApi.off("select", syncMobileSelection);
      mobileApi.off("reInit", syncMobileSelection);
    };
  }, [mobileApi]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#fff8fb_42%,#fff_100%)]">
      <section className="mx-auto max-w-7xl px-6 pb-10 pt-20">
        <div className="flex flex-col gap-6 text-center md:flex-row md:items-end md:justify-between md:text-left">
          <div>
            <h1 className="text-5xl font-light tracking-tight text-neutral-900 md:text-6xl">
              Find a{" "}
              <span className="font-serif italic">
                Nana
              </span>{" "}
              store
            </h1>
            <p className="mx-auto mt-4 max-w-md text-neutral-500 md:mx-0">
              Visit one of our boutiques for hands-on guidance, gift
              wrapping, and exclusive in-store collections.
            </p>
          </div>
          <p className="text-sm text-neutral-400">
            {stores.length} locations
          </p>
        </div>
      </section>

      <section className="lg:hidden">
        <div className="mx-auto max-w-7xl px-6 pb-24">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b65287]">
              Swipe Through Locations
            </p>
            <p className="text-sm text-neutral-400">
              {mobileIndex + 1} / {stores.length}
            </p>
          </div>

          <Carousel
            className="px-1"
            opts={{ align: "start", loop: stores.length > 1 }}
            setApi={setMobileApi}
          >
            <CarouselContent>
              {stores.map((store) => (
                <CarouselItem key={store.id}>
                  <MobileStoreSlide store={store} />
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
                    mobileIndex === index
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
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => setActive(store)}
                className={`w-full rounded-[1.6rem] border p-5 text-left transition-all ${
                  active.id === store.id
                    ? "border-neutral-900 bg-neutral-900 text-white shadow-xl"
                    : "border-neutral-200 bg-white hover:border-neutral-400"
                }`}
              >
                <p
                  className={`text-xs uppercase tracking-[0.22em] ${
                    active.id === store.id
                      ? "text-rose-300"
                      : "text-[#b65287]"
                  }`}
                >
                  {store.city}
                </p>
                <p className="font-brand mt-1 text-2xl font-semibold tracking-tight">
                  {store.name}
                </p>
                <p
                  className={`mt-2 text-sm ${
                    active.id === store.id
                      ? "text-neutral-300"
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
                <p className="text-sm uppercase tracking-[0.22em] text-rose-200">
                  {active.city}
                </p>
                <h2 className="font-brand mt-2 text-5xl font-semibold tracking-tight">
                  {active.name}
                </h2>
              </div>
            </div>

            <div className="grid gap-8 p-8 xl:grid-cols-[0.96fr_1.04fr]">
              <div className="space-y-6">
                <StoreFacts store={active} />

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
