export type SiteContentSettingRecord = {
  key: string;
  updated_at?: string | null;
  value: unknown;
};

export type HomepageReviewRecord = {
  created_at?: string | null;
  id: string;
  is_active: boolean;
  rating: number;
  review_text: string;
  reviewer_name: string;
  reviewer_role?: string | null;
  sort_order: number;
  updated_at?: string | null;
};

export type HomepageReview = {
  id: string;
  isActive: boolean;
  rating: number;
  reviewText: string;
  reviewerName: string;
  reviewerRole?: string | null;
  sortOrder: number;
};

export type HomepageImageAsset = {
  alt: string;
  image: string;
};

export type HomepageSiteContent = {
  aboutImages: HomepageImageAsset[];
  heroImage: HomepageImageAsset;
};

export const DEFAULT_HERO_IMAGE: HomepageImageAsset = {
  image:
    "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxMHx8YmFieSUyMHByb2R1Y3RzJTIwdG95c3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
  alt: "Happy baby with toys",
};

export const DEFAULT_ABOUT_IMAGES: HomepageImageAsset[] = [
  {
    image:
      "https://images.unsplash.com/photo-1522771930-78848d9293e8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw2fHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    alt: "Baby with parent",
  },
  {
    image:
      "https://images.unsplash.com/photo-1647687663833-fcc91fd99792?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OHww&ixlib=rb-4.1.0&q=80&w=1080",
    alt: "Baby playing",
  },
  {
    image:
      "https://images.unsplash.com/photo-1709380830070-2c0da9348126?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OHww&ixlib=rb-4.1.0&q=80&w=1080",
    alt: "Baby with toys",
  },
  {
    image:
      "https://images.unsplash.com/photo-1560506840-ec148e82a604?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    alt: "Baby clothes",
  },
];

export const DEFAULT_HOMEPAGE_REVIEWS: HomepageReview[] = [
  {
    id: "fallback-review-1",
    reviewerName: "Amaka O.",
    reviewerRole: "First-time mum in Lagos",
    reviewText:
      "Shopping from Nana's Baby Essentials felt easy from start to finish. The delivery was quick, the items matched the photos, and the quality was exactly what I wanted for my baby.",
    rating: 5,
    sortOrder: 0,
    isActive: true,
  },
  {
    id: "fallback-review-2",
    reviewerName: "Tolu A.",
    reviewerRole: "Registry owner",
    reviewText:
      "The baby registry made it simple for family and friends to support us. I especially liked that people could contribute toward the exact items we still needed.",
    rating: 5,
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "fallback-review-3",
    reviewerName: "Chioma E.",
    reviewerRole: "Returning customer",
    reviewText:
      "I keep coming back because the store feels dependable. The product selection is thoughtful, customer support responds quickly, and the whole experience feels built for real parents.",
    rating: 5,
    sortOrder: 2,
    isActive: true,
  },
];

export const DEFAULT_REGISTRY_REVIEWS: HomepageReview[] = [
  {
    id: "registry-review-1",
    reviewerName: "Ada N.",
    reviewerRole: "Mum-to-be building her first registry",
    reviewText:
      "The registry page made it easy to keep everything in one place. I could share one link, track what had been covered, and still update my list when priorities changed.",
    rating: 5,
    sortOrder: 0,
    isActive: true,
  },
  {
    id: "registry-review-2",
    reviewerName: "Bola A.",
    reviewerRole: "Family gift contributor",
    reviewText:
      "I liked that I could contribute toward exactly what the parents still needed without guessing. The registry felt clear, organized, and easy to use on my phone.",
    rating: 5,
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "registry-review-3",
    reviewerName: "Kemi O.",
    reviewerRole: "Returning registry owner",
    reviewText:
      "Being able to mix everyday essentials, bundles, and larger packages in one registry saved me a lot of time. It felt practical, not overwhelming.",
    rating: 5,
    sortOrder: 2,
    isActive: true,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeImageAsset(
  value: unknown,
  fallback: HomepageImageAsset,
): HomepageImageAsset {
  if (!isRecord(value)) {
    return fallback;
  }

  const image =
    typeof value.image === "string" && value.image.trim()
      ? value.image.trim()
      : fallback.image;
  const alt =
    typeof value.alt === "string" && value.alt.trim()
      ? value.alt.trim()
      : fallback.alt;

  return { image, alt };
}

export function buildHomepageSiteContent(
  settings: SiteContentSettingRecord[] | null | undefined,
): HomepageSiteContent {
  const settingMap = Object.fromEntries(
    (settings ?? []).map((setting) => [setting.key, setting.value]),
  ) as Record<string, unknown>;

  const heroImage = normalizeImageAsset(
    settingMap.hero_image,
    DEFAULT_HERO_IMAGE,
  );

  const rawAboutImages = Array.isArray(settingMap.about_images)
    ? settingMap.about_images
    : [];

  const aboutImages = DEFAULT_ABOUT_IMAGES.map((fallback, index) => {
    return normalizeImageAsset(rawAboutImages[index], fallback);
  });

  return {
    heroImage,
    aboutImages,
  };
}

export function normalizeHomepageReviewRecord(
  record: HomepageReviewRecord,
): HomepageReview {
  return {
    id: record.id,
    reviewerName: record.reviewer_name,
    reviewerRole: record.reviewer_role ?? null,
    reviewText: record.review_text,
    rating: Math.min(5, Math.max(1, Number(record.rating ?? 5))),
    sortOrder: Number(record.sort_order ?? 0),
    isActive: Boolean(record.is_active),
  };
}

function buildManagedReviews(
  records: HomepageReviewRecord[] | null | undefined,
  fallbackReviews: HomepageReview[],
): HomepageReview[] {
  const mapped = (records ?? [])
    .map(normalizeHomepageReviewRecord)
    .filter((review) => review.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return mapped.length > 0 ? mapped : fallbackReviews;
}

export function buildHomepageReviews(
  records: HomepageReviewRecord[] | null | undefined,
): HomepageReview[] {
  return buildManagedReviews(records, DEFAULT_HOMEPAGE_REVIEWS);
}

export function buildRegistryReviews(
  records: HomepageReviewRecord[] | null | undefined,
): HomepageReview[] {
  return buildManagedReviews(records, DEFAULT_REGISTRY_REVIEWS);
}
