export type CustomerReviewSource = "web" | "qr";
export type CustomerReviewSection = "homepage" | "registry";

export type CustomerReviewRecord = {
  created_at: string;
  id: string;
  published_at?: string | null;
  published_review_id?: string | null;
  published_section?: string | null;
  rating: number;
  review_text: string;
  reviewer_email?: string | null;
  reviewer_name: string;
  reviewer_phone?: string | null;
  source?: string | null;
  store_slug?: string | null;
  updated_at?: string | null;
  user_id?: string | null;
};

export const CUSTOMER_REVIEW_SELECT =
  "id, user_id, reviewer_name, reviewer_email, reviewer_phone, rating, review_text, source, store_slug, published_section, published_review_id, published_at, created_at, updated_at";

export const REVIEW_SECTION_TABLE: Record<CustomerReviewSection, string> = {
  homepage: "homepage_reviews",
  registry: "registry_reviews",
};

export const REVIEW_SECTION_LABEL: Record<CustomerReviewSection, string> = {
  homepage: "Homepage reviews",
  registry: "Registry reviews",
};

export function normalizeCustomerReviewSource(
  value?: string | null,
): CustomerReviewSource {
  return value === "qr" ? "qr" : "web";
}

export function normalizeReviewSection(
  value?: string | null,
): CustomerReviewSection | null {
  return value === "homepage" || value === "registry" ? value : null;
}
