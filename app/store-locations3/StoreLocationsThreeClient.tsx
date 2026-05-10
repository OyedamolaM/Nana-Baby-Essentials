"use client";

import { useState } from "react";
import Image from "next/image";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

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
    address: "71, Ogunlana drive, Surulere, Lagos",
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

export function StoreLocationsThreeClient() {
  const [active, setActive] = useState(stores[0]);

  return (
    <main className="min-h-screen bg-rose-50/40">
      <section className="px-6 pb-10 pt-20 text-center">
        <h1 className="font-serif text-5xl text-neutral-900 md:text-6xl">
          Our Stores
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-neutral-600">
          Select a location to view details, hours, and directions.
        </p>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 pb-24 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => setActive(store)}
              className={`w-full rounded-2xl border p-5 text-left transition-all ${
                active.id === store.id
                  ? "border-neutral-900 bg-neutral-900 text-white shadow-xl"
                  : "border-neutral-200 bg-white hover:border-neutral-400"
              }`}
            >
              <p
                className={`text-xs uppercase tracking-widest ${
                  active.id === store.id
                    ? "text-rose-300"
                    : "text-rose-400"
                }`}
              >
                {store.city}
              </p>
              <p className="mt-1 text-lg font-medium">{store.name}</p>
              <p
                className={`mt-1 text-sm ${
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

        <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
          <div className="relative h-72">
            <Image
              src={active.image}
              alt={active.name}
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-6 left-6 text-white">
              <p className="text-sm uppercase tracking-widest text-rose-200">
                {active.city}
              </p>
              <h2 className="font-serif text-4xl">{active.name}</h2>
            </div>
          </div>

          <div className="grid gap-8 p-8 md:grid-cols-2">
            <div className="space-y-4 text-neutral-700">
              <p className="flex items-start gap-3">
                <MapPin className="mt-1 h-5 w-5 shrink-0 text-rose-500" />
                <span>{active.address}</span>
              </p>
              <p className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-rose-500" />
                <span>{active.phone}</span>
              </p>
              <p className="flex items-center gap-3">
                <Mail className="h-5 w-5 shrink-0 text-rose-500" />
                <span>{active.email}</span>
              </p>

              <div className="border-t pt-4">
                <p className="flex items-center gap-2 font-medium text-neutral-900">
                  <Clock className="h-5 w-5 text-rose-500" />
                  Opening Hours
                </p>
                <ul className="mt-3 space-y-1 text-sm">
                  {active.hours.map(([day, time]) => (
                    <li key={day} className="flex justify-between gap-4">
                      <span>{day}</span>
                      <span className="text-neutral-500">{time}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  active.address,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-full bg-rose-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-rose-600"
              >
                Get Directions →
              </a>
            </div>

            <div className="min-h-[300px] overflow-hidden rounded-2xl border border-neutral-200">
              <iframe
                key={active.id}
                src={`https://www.google.com/maps?q=${encodeURIComponent(
                  active.mapQuery,
                )}&output=embed`}
                title={`${active.name} map`}
                className="h-full min-h-[300px] w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
