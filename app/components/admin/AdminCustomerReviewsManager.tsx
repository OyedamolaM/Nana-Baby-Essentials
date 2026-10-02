"use client";

import { useMemo, useState } from "react";
import {
  Download,
  Globe,
  MapPin,
  PlusCircle,
  Printer,
  QrCode,
  RefreshCw,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "../../lib/supabase";
import {
  normalizeCustomerReviewSource,
  normalizeReviewSection,
  REVIEW_SECTION_LABEL,
  REVIEW_SECTION_TABLE,
  type CustomerReviewRecord,
  type CustomerReviewSection,
} from "../../../lib/customerReviews";
import { type StoreLocationRecord } from "../../../lib/storeLocations";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type ReviewFilter = "all" | "added" | "not-added";

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AdminCustomerReviewsManager({
  loading,
  onRefresh,
  reviews,
  storeLocations,
}: {
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  reviews: CustomerReviewRecord[];
  storeLocations: StoreLocationRecord[];
}) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qrStore, setQrStore] = useState("all");
  const [targetSection, setTargetSection] = useState<CustomerReviewSection>("homepage");

  const addedCount = reviews.filter((review) => normalizeReviewSection(review.published_section)).length;

  const visibleReviews = useMemo(() => {
    const sorted = [...reviews].sort((a, b) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );
    if (filter === "all") return sorted;
    return sorted.filter((review) =>
      filter === "added"
        ? Boolean(normalizeReviewSection(review.published_section))
        : !normalizeReviewSection(review.published_section),
    );
  }, [filter, reviews]);

  const storeNameBySlug = useMemo(
    () => Object.fromEntries(storeLocations.map((location) => [location.slug, location.name])),
    [storeLocations],
  );

  const addToReviewSection = async (review: CustomerReviewRecord) => {
    setBusyId(review.id);
    try {
      const table = REVIEW_SECTION_TABLE[targetSection];
      const { data: lastRow } = await supabase
        .from(table)
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextSortOrder = Number(lastRow?.sort_order ?? -1) + 1;

      const { data: created, error: createError } = await supabase
        .from(table)
        .insert({
          reviewer_name: review.reviewer_name,
          reviewer_role: review.user_id ? "Verified customer" : null,
          review_text: review.review_text,
          rating: Number(review.rating ?? 5),
          sort_order: nextSortOrder,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (createError || !created) {
        toast.error("Could not add this review to the review section.");
        return;
      }

      const { error: updateError } = await supabase
        .from("customer_reviews")
        .update({
          published_section: targetSection,
          published_review_id: created.id,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", review.id);

      if (updateError) {
        await supabase.from(table).delete().eq("id", created.id);
        toast.error("Could not add this review to the review section.");
        return;
      }

      toast.success(`Added to ${REVIEW_SECTION_LABEL[targetSection].toLowerCase()}.`);
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const removeFromReviewSection = async (review: CustomerReviewRecord) => {
    const section = normalizeReviewSection(review.published_section);
    if (!section) return;

    setBusyId(review.id);
    try {
      if (review.published_review_id) {
        const { error: deleteError } = await supabase
          .from(REVIEW_SECTION_TABLE[section])
          .delete()
          .eq("id", review.published_review_id);

        if (deleteError) {
          toast.error("Could not remove this review from the review section.");
          return;
        }
      }

      const { error } = await supabase
        .from("customer_reviews")
        .update({
          published_section: null,
          published_review_id: null,
          published_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", review.id);

      if (error) {
        toast.error("Could not remove this review from the review section.");
        return;
      }

      toast.success("Removed from the review section.");
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const deleteReview = async (review: CustomerReviewRecord) => {
    const section = normalizeReviewSection(review.published_section);

    setBusyId(review.id);
    try {
      if (section && review.published_review_id) {
        await supabase
          .from(REVIEW_SECTION_TABLE[section])
          .delete()
          .eq("id", review.published_review_id);
      }

      const { error } = await supabase.from("customer_reviews").delete().eq("id", review.id);
      if (error) {
        toast.error("Could not delete this review.");
        return;
      }

      toast.success("Review deleted.");
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const qrPreviewSrc = `/api/review-qr${qrStore !== "all" ? `?store=${encodeURIComponent(qrStore)}` : ""}`;

  const printPoster = () => {
    const storeLabel = qrStore !== "all" ? storeNameBySlug[qrStore] ?? qrStore : "";
    const poster = window.open("", "_blank", "width=820,height=1040");
    if (!poster) {
      toast.error("Allow pop-ups to print the QR poster.");
      return;
    }

    const qrSrc = `${window.location.origin}${qrPreviewSrc}`;
    poster.document.write(`<!doctype html>
<html>
  <head>
    <title>Leave a review - QR poster</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Georgia, 'Times New Roman', serif; margin: 0; padding: 48px; color: #1f2937; }
      .poster { border: 2px solid #fbcfe8; border-radius: 32px; padding: 48px; text-align: center; }
      .eyebrow { text-transform: uppercase; letter-spacing: 0.18em; font-size: 13px; color: #db2777; margin: 0 0 12px; }
      h1 { font-size: 40px; margin: 0 0 8px; }
      p { font-size: 18px; color: #4b5563; margin: 0 0 24px; }
      img { width: 320px; height: 320px; }
      .store { margin-top: 16px; font-size: 20px; font-weight: 600; }
      .foot { margin-top: 12px; font-size: 14px; color: #9ca3af; }
    </style>
  </head>
  <body>
    <div class="poster">
      <p class="eyebrow">Nana's Baby Essentials</p>
      <h1>Loved shopping with us?</h1>
      <p>Scan the code to share your experience. It takes less than a minute.</p>
      <img src="${qrSrc}" alt="QR code linking to the review form" />
      ${storeLabel ? `<div class="store">${storeLabel}</div>` : ""}
      <div class="foot">Thank you for helping other families shop with confidence.</div>
    </div>
    <script>window.onload = function () { window.print(); };</script>
  </body>
</html>`);
    poster.document.close();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Customer Reviews</CardTitle>
            <p className="text-sm text-gray-500">
              Reviews submitted from the storefront and in-store QR codes. Add the
              ones you like to your live review section, or remove them.
            </p>
          </div>
          <Button variant="outline" onClick={() => void onRefresh()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                All ({reviews.length})
              </Button>
              <Button
                variant={filter === "not-added" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("not-added")}
              >
                Not added ({reviews.length - addedCount})
              </Button>
              <Button
                variant={filter === "added" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("added")}
              >
                In review section ({addedCount})
              </Button>
            </div>

            <div className="ml-auto flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="review-target-section" className="text-xs text-gray-500">
                  Add to
                </Label>
                <Select
                  value={targetSection}
                  onValueChange={(value) => setTargetSection(value as CustomerReviewSection)}
                >
                  <SelectTrigger id="review-target-section" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homepage">Homepage reviews</SelectItem>
                    <SelectItem value="registry">Registry reviews</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {visibleReviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-gray-500">
              {loading ? "Loading reviews..." : "No reviews in this view yet."}
            </div>
          ) : (
            <div className="space-y-4">
              {visibleReviews.map((review) => {
                const source = normalizeCustomerReviewSource(review.source);
                const section = normalizeReviewSection(review.published_section);
                const storeName = review.store_slug
                  ? storeNameBySlug[review.store_slug] ?? review.store_slug
                  : "";
                const busy = busyId === review.id;

                return (
                  <div key={review.id} className="rounded-2xl border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{review.reviewer_name}</p>
                          <span className="flex items-center gap-0.5 text-amber-500">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <Star
                                key={`${review.id}-star-${index}`}
                                className="h-3.5 w-3.5"
                                fill={index < Number(review.rating ?? 0) ? "currentColor" : "none"}
                              />
                            ))}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-pink-700">
                            {source === "qr" ? (
                              <>
                                <QrCode className="h-3 w-3" /> In-store
                              </>
                            ) : (
                              <>
                                <Globe className="h-3 w-3" /> Online
                              </>
                            )}
                          </span>
                          {storeName ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                              <MapPin className="h-3 w-3" /> {storeName}
                            </span>
                          ) : null}
                          {section ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              In {REVIEW_SECTION_LABEL[section].toLowerCase()}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-gray-700">{review.review_text}</p>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(review.created_at)}
                          {review.reviewer_email ? ` · ${review.reviewer_email}` : ""}
                          {review.reviewer_phone ? ` · ${review.reviewer_phone}` : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
                        {section ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void removeFromReviewSection(review)}
                          >
                            <XCircle className="mr-2 h-4 w-4" /> Remove from section
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void addToReviewSection(review)}
                          >
                            <PlusCircle className="mr-2 h-4 w-4" /> Add to review section
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void deleteReview(review)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>In-store QR code</CardTitle>
          <p className="text-sm text-gray-500">
            Print this code for a store counter or table. Customers scan it to open
            the review form, and their reviews are tagged to that store.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm space-y-2">
            <Label htmlFor="review-qr-store">Store</Label>
            <Select value={qrStore} onValueChange={setQrStore}>
              <SelectTrigger id="review-qr-store">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stores (no tag)</SelectItem>
                {storeLocations.map((location) => (
                  <SelectItem key={location.id} value={location.slug}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrPreviewSrc}
              alt="Review QR code preview"
              className="h-40 w-40 rounded-xl border bg-white p-2"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={printPoster}>
                <Printer className="mr-2 h-4 w-4" /> Print poster
              </Button>
              <Button asChild variant="outline">
                <a
                  href={qrPreviewSrc}
                  download={`review-qr-${qrStore === "all" ? "all-stores" : qrStore}.svg`}
                >
                  <Download className="mr-2 h-4 w-4" /> Download SVG
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
