import Image from "next/image";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

import { Footer } from "../components/Footer";
import { SiteHeaderShell } from "../components/SiteHeaderShell";
import { getStoreLocations } from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";

const stores = [
  {
    name: "Nana Baby Essentials — Lagos Flagship",
    image:
      "https://images.unsplash.com/photo-1555529771-7888783a18d3?auto=format&fit=crop&w=1200&q=80",
    address: "12 Admiralty Way, Lekki Phase 1, Lagos",
    phone: "+234 801 234 5678",
    email: "lagos@nanababyessentials.com",
    hours: [
      { day: "Mon – Fri", time: "9:00 AM – 7:00 PM" },
      { day: "Saturday", time: "10:00 AM – 8:00 PM" },
      { day: "Sunday", time: "12:00 PM – 5:00 PM" },
    ],
    mapUrl:
      "https://www.google.com/maps?q=Lekki+Phase+1+Lagos&output=embed",
  },
  {
    name: "Nana Baby Essentials — Abuja",
    image:
      "https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=1200&q=80",
    address: "Plot 25, Aminu Kano Crescent, Wuse 2, Abuja",
    phone: "+234 802 345 6789",
    email: "abuja@nanababyessentials.com",
    hours: [
      { day: "Mon – Fri", time: "9:00 AM – 7:00 PM" },
      { day: "Saturday", time: "10:00 AM – 8:00 PM" },
      { day: "Sunday", time: "Closed" },
    ],
    mapUrl:
      "https://www.google.com/maps?q=Wuse+2+Abuja&output=embed",
  },
];

export const metadata = buildPageMetadata({
  title: "Store Locations",
  description:
    "Preview Nana's Baby Essentials store locations layout with address, contact details, opening hours, and map directions.",
  path: "/store-locations",
});

export default async function StoreLocationsPage() {
  const locations = await getStoreLocations();

  return (
    <>
      <SiteHeaderShell locations={locations} />

      <main className="min-h-screen bg-[#fdf9f4] text-stone-800">
        <section className="px-6 pb-12 pt-16 text-center sm:pt-20">
          <p className="text-sm uppercase tracking-[0.3em] text-rose-400">
            Visit Us
          </p>
          <h1 className="mt-4 text-4xl text-stone-900 sm:text-5xl md:text-6xl">
            Our Stores
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-stone-600">
            Step into a world made for little ones. Find your nearest
            Nana Baby Essentials and experience our collection in
            person.
          </p>
        </section>

        <section className="mx-auto max-w-6xl space-y-20 px-6 pb-24">
          {stores.map((store, index) => (
            <article
              key={store.name}
              className={`grid items-center gap-10 md:grid-cols-2 ${
                index % 2 === 1
                  ? "md:[&>div:first-child]:order-2"
                  : ""
              }`}
            >
              <div className="overflow-hidden rounded-3xl shadow-xl">
                <Image
                  src={store.image}
                  alt={store.name}
                  width={900}
                  height={700}
                  className="h-[320px] w-full object-cover transition-transform duration-700 hover:scale-105 sm:h-[420px]"
                />
              </div>

              <div>
                <h2 className="text-3xl text-stone-900 md:text-4xl">
                  {store.name}
                </h2>

                <div className="mt-6 space-y-4 text-stone-700">
                  <p className="flex items-start gap-3">
                    <MapPin className="mt-1 h-5 w-5 shrink-0 text-rose-400" />
                    <span>{store.address}</span>
                  </p>
                  <p className="flex items-center gap-3">
                    <Phone className="h-5 w-5 shrink-0 text-rose-400" />
                    <span>{store.phone}</span>
                  </p>
                  <p className="flex items-center gap-3">
                    <Mail className="h-5 w-5 shrink-0 text-rose-400" />
                    <span>{store.email}</span>
                  </p>
                </div>

                <div className="mt-8 border-t border-stone-200 pt-6">
                  <p className="flex items-center gap-2 font-medium text-stone-900">
                    <Clock className="h-5 w-5 text-rose-400" />
                    Opening Hours
                  </p>
                  <ul className="mt-3 max-w-xs space-y-1 text-stone-600">
                    {store.hours.map((hour) => (
                      <li
                        key={hour.day}
                        className="flex justify-between gap-5"
                      >
                        <span>{hour.day}</span>
                        <span>{hour.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 overflow-hidden rounded-2xl border border-stone-200">
                  <iframe
                    src={store.mapUrl}
                    title={`${store.name} map`}
                    className="h-56 w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>

                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    store.address,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-block rounded-full bg-stone-900 px-7 py-3 text-sm tracking-wide text-white transition hover:bg-rose-400"
                >
                  Get Directions →
                </a>
              </div>
            </article>
          ))}
        </section>
      </main>

      <Footer />
    </>
  );
}
