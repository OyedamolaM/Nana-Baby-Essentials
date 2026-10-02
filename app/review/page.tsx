import { Footer } from "../components/Footer";
import { SiteHeaderShell } from "../components/SiteHeaderShell";
import { ReviewForm } from "../components/reviews/ReviewForm";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Leave a Review",
  description:
    "Share your experience shopping with Nana's Baby Essentials. Tell us about your order, delivery, or in-store visit.",
  path: "/review",
});

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string; store?: string }>;
}) {
  const params = await searchParams;
  const source = params.src === "qr" ? "qr" : "web";
  const storeSlug = params.store?.trim() ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-[#fffaf7] text-gray-900">
      <SiteHeaderShell />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <div className="text-center">
            <p className="brand-script-label mb-3">Customer Reviews</p>
            <h1 className="section-title text-gray-950">Share your experience</h1>
            <p className="section-copy-lg mt-4">
              Tell us how your order, delivery, or in-store visit went. We may
              feature your review in our reviews section.
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-rose-100 bg-white p-6 shadow-sm sm:p-8">
            <ReviewForm source={source} storeSlug={storeSlug} />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
