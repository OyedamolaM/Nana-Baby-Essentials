import { type HomepageReview } from "./siteContent";

export const REGISTRY_REVIEWS: HomepageReview[] = [
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

export const REGISTRY_CHECKLIST_DOWNLOAD_PATH =
  "/downloads/nbe-registry-checklist.txt";
