export interface HomeDealRecord {
  id: string;
  product_id: number;
  title: string;
  subtitle?: string | null;
  badge_text?: string | null;
  override_image?: string | null;
  sale_price: number;
  compare_at_price?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export interface CollectionRecord {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  hero_image?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export interface BlogPostRecord {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  cover_image?: string | null;
  body_markdown: string;
  author_name: string;
  published_at?: string | null;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

export function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export const FALLBACK_BLOG_POSTS: BlogPostRecord[] = [
  {
    id: "fallback-1",
    title: "10 Must-Have Items for Your Baby Registry",
    slug: "10-must-have-items-for-your-baby-registry",
    category: "Registry Tips",
    excerpt:
      "Creating a baby registry can be overwhelming. Here are the essential items every new parent needs to include.",
    cover_image:
      "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800",
    body_markdown:
      "Creating a baby registry can feel like a lot at first, but focusing on feeding, sleep, travel, and everyday care makes it much easier. Start with the essentials, then add a few comfort and memory-making items you truly love.",
    author_name: "Sarah Johnson",
    published_at: "2026-04-28T09:00:00.000Z",
    is_published: true,
  },
  {
    id: "fallback-2",
    title: "Preparing Your Nursery: A Complete Guide",
    slug: "preparing-your-nursery-a-complete-guide",
    category: "Nursery",
    excerpt:
      "Transform your spare room into the perfect nursery for your little one with our step-by-step guide.",
    cover_image:
      "https://images.unsplash.com/photo-1522771930-78848d9293e8?w=800",
    body_markdown:
      "A calm nursery starts with a safe sleep setup, practical storage, and soft lighting. Build around your day-to-day routines so the room stays easy to use after baby arrives.",
    author_name: "Michael Chen",
    published_at: "2026-04-25T09:00:00.000Z",
    is_published: true,
  },
  {
    id: "fallback-3",
    title: "The Benefits of Organic Cotton for Baby Clothes",
    slug: "the-benefits-of-organic-cotton-for-baby-clothes",
    category: "Baby Care",
    excerpt:
      "Learn why organic cotton is the best choice for your baby's sensitive skin and how to identify quality products.",
    cover_image:
      "https://images.unsplash.com/photo-1622290291165-d341f1938b8a?w=800",
    body_markdown:
      "Organic cotton is breathable, gentle on delicate skin, and often made with fewer harsh processing chemicals. It can be a great option for babies with sensitivity or eczema-prone skin.",
    author_name: "Dr. Ada Okafor",
    published_at: "2026-04-20T09:00:00.000Z",
    is_published: true,
  },
  {
    id: "fallback-4",
    title: "How to Choose the Right Baby Toys by Age",
    slug: "how-to-choose-the-right-baby-toys-by-age",
    category: "Development",
    excerpt:
      "From newborns to toddlers, discover the perfect developmental toys for every stage of your baby's growth.",
    cover_image:
      "https://images.unsplash.com/photo-1655087751207-1020c89f7eee?w=800",
    body_markdown:
      "At every stage, the best toys support attention, movement, sensory exploration, and safe curiosity. Look for simple, durable toys that invite repeat play.",
    author_name: "Sarah Johnson",
    published_at: "2026-04-18T09:00:00.000Z",
    is_published: true,
  },
];
