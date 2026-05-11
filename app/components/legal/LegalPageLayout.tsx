import type { ReactNode } from "react";
import Link from "next/link";

import { Footer } from "../Footer";
import { SiteHeaderShell } from "../SiteHeaderShell";

type LegalPageLayoutProps = {
  children: ReactNode;
  description: string;
  lastUpdated: string;
  title: string;
};

export function LegalPageLayout({
  children,
  description,
  lastUpdated,
  title,
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-[#fffaf7] text-gray-900">
      <SiteHeaderShell />
      <main className="flex-1">
        <section className="border-b border-rose-100 bg-gradient-to-b from-rose-50 to-white">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="mb-4 text-sm text-gray-500">
              <Link href="/" className="transition-colors hover:text-pink-600">
                Home
              </Link>
              <span className="mx-2">/</span>
              <span>{title}</span>
            </div>
            <div className="max-w-3xl space-y-4">
              <h1 className="section-title text-gray-950">
                {title}
              </h1>
              <p className="section-copy-lg">
                {description}
              </p>
              <p className="text-sm font-medium text-gray-500">
                Last updated: {lastUpdated}
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-rose-100 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
            <div className="space-y-8 text-sm leading-7 text-gray-700 sm:text-base">
              {children}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
