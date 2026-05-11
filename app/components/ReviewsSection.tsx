"use client";

import { Quote, Star } from "lucide-react";

import { type HomepageReview } from "../../lib/siteContent";

interface ReviewsSectionProps {
  description?: string;
  eyebrow?: string;
  highlightText?: string;
  reviews?: HomepageReview[];
  title?: string;
}

function getReviewerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function renderTitleWithHighlight(title: string, highlightText?: string) {
  if (!highlightText || !title.includes(highlightText)) {
    return title;
  }

  const [before, after] = title.split(highlightText, 2);

  return (
    <>
      {before}
      <span className="brand-script">{highlightText}</span>
      {after}
    </>
  );
}

export function ReviewsSection({
  description = "Real feedback from customers who have shopped, gifted, and built registries with us.",
  eyebrow = "Parent Reviews",
  highlightText = "Families Say",
  reviews = [],
  title = "What Families Say About Nana's Baby Essentials",
}: ReviewsSectionProps) {
  if (reviews.length === 0) {
    return null;
  }

  return (
    <section className="bg-rose-50 py-14 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="brand-script-label mb-3">
            {eyebrow}
          </p>
          <h2 className="section-title">
            {renderTitleWithHighlight(title, highlightText)}
          </h2>
          <p className="section-copy-lg mt-4">
            {description}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {reviews.map((review) => (
            <article
              key={review.id}
              className="flex h-full flex-col rounded-3xl border border-rose-100 bg-white p-6 shadow-sm"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 text-sm font-semibold text-pink-700">
                  {getReviewerInitials(review.reviewerName)}
                </div>
                <Quote className="h-6 w-6 text-pink-300" />
              </div>

              <div className="mb-4 flex items-center gap-1 text-amber-500">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={`${review.id}-star-${index}`}
                    className="h-4 w-4"
                    fill={index < review.rating ? "currentColor" : "none"}
                  />
                ))}
              </div>

              <p className="flex-1 text-base leading-7 text-gray-700">
                {review.reviewText}
              </p>

              <div className="mt-6 border-t border-rose-100 pt-4">
                <p className="font-semibold text-gray-900">{review.reviewerName}</p>
                {review.reviewerRole ? (
                  <p className="text-sm text-gray-500">{review.reviewerRole}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
