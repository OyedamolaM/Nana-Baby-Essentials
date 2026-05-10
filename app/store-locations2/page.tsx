import Image from "next/image";
import {
  ArrowUpRight,
  Clock,
  MapPin,
  Phone,
} from "lucide-react";

import { Footer } from "../components/Footer";
import { SiteHeaderShell } from "../components/SiteHeaderShell";
import { getStoreLocations } from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";

const stores = [
  {
    name: "Lekki Flagship",
    city: "Lagos",
    image:
      "https://images.unsplash.com/photo-1555529771-7888783a18d3?auto=format&fit=crop&w=900&q=80",
    address: "12 Admiralty Way, Lekki Phase 1",
    phone: "+234 801 234 5678",
    hours: "Mon-Sat 9AM-8PM · Sun 12-5PM",
  },
  {
    name: "Wuse 2 Boutique",
    city: "Abuja",
    image:
      "https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=900&q=80",
    address: "Plot 25, Aminu Kano Crescent",
    phone: "+234 802 345 6789",
    hours: "Mon-Fri 9AM-7PM · Sat 10AM-8PM",
  },
  {
    name: "GRA Showroom",
    city: "Port Harcourt",
    image:
      "https://images.unsplash.com/photo-1617331721458-bd3bd3f9c7f8?auto=format&fit=crop&w=900&q=80",
    address: "8 Evo Road, GRA Phase 2",
    phone: "+234 803 456 7890",
    hours: "Mon-Sat 10AM-7PM",
  },
];

export const metadata = buildPageMetadata({
  title: "Store Locations Preview Two",
  description:
    "Comparison preview for Nana's Baby Essentials store locations grid card design.",
  path: "/store-locations2",
  noIndex: true,
});

export default async function StoreLocationsTwoPage() {
  const locations = await getStoreLocations();

  return (
    <>
      <SiteHeaderShell locations={locations} />

      <main className="min-h-screen bg-white">
        <section className="mx-auto max-w-7xl px-6 pb-12 pt-24">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-5xl font-light tracking-tight text-neutral-900 md:text-6xl">
                Find a{" "}
                <span className="font-serif italic text-[#b65287]">
                  Nana
                </span>{" "}
                store
              </h1>
              <p className="mt-4 max-w-md text-neutral-500">
                Visit one of our boutiques for hands-on guidance,
                gift wrapping, and exclusive in-store collections.
              </p>
            </div>

            <p className="text-sm text-neutral-400">
              {stores.length} locations
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-28">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <div
                key={store.name}
                className="group overflow-hidden rounded-2xl border border-neutral-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
              >
                <div className="relative h-56 overflow-hidden">
                  <Image
                    src={store.image}
                    alt={store.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs uppercase tracking-widest backdrop-blur">
                    {store.city}
                  </span>
                </div>

                <div className="p-6">
                  <h2 className="text-xl font-medium text-neutral-900">
                    {store.name}
                  </h2>

                  <ul className="mt-4 space-y-2 text-sm text-neutral-600">
                    <li className="flex gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
                      <span>{store.address}</span>
                    </li>
                    <li className="flex gap-2">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
                      <span>{store.phone}</span>
                    </li>
                    <li className="flex gap-2">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
                      <span>{store.hours}</span>
                    </li>
                  </ul>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      store.address,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex items-center gap-1 border-b border-neutral-900 pb-0.5 text-sm font-medium text-neutral-900 transition hover:border-pink-500 hover:text-pink-500"
                  >
                    Get directions
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
