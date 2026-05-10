import { normalizeProductCategoryLabels } from "./productCategories";

export interface StoreProduct {
  categories?: string[];
  id: number;
  name: string;
  slug: string;
  price: number;
  sellingPrice?: number;
  costPrice?: number;
  category: string;
  image: string;
  description: string;
  inStock: boolean;
  isFeatured: boolean;
  featuredSortOrder: number;
}

export interface ProductRecord {
  categories?: string[] | null;
  id: number;
  name: string;
  slug?: string | null;
  price?: number | null;
  cost_price?: number | null;
  selling_price?: number | null;
  category: string;
  image: string;
  description: string;
  in_stock: boolean;
  is_featured?: boolean | null;
  featured_sort_order?: number | null;
  created_at?: string;
}

export const SEED_PRODUCTS: StoreProduct[] = [
  {
    id: 1,
    name: "Soft Plush Teddy Bear",
    slug: "soft-plush-teddy-bear",
    price: 24.99,
    sellingPrice: 24.99,
    costPrice: 16.99,
    category: "Toys",
    image:
      "https://images.unsplash.com/photo-1684577753340-de97c66fa6fd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OHww&ixlib=rb-4.1.0&q=80&w=1080",
    description:
      "Ultra-soft and cuddly teddy bear, perfect for bedtime snuggles",
    inStock: true,
    isFeatured: true,
    featuredSortOrder: 0,
  },
  {
    id: 2,
    name: "Organic Cotton Onesie",
    slug: "organic-cotton-onesie",
    price: 18.99,
    sellingPrice: 18.99,
    costPrice: 12.99,
    category: "Clothing",
    image:
      "https://images.unsplash.com/photo-1622290291165-d341f1938b8a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description:
      "100% organic cotton onesie, gentle on baby's sensitive skin",
    inStock: true,
    isFeatured: true,
    featuredSortOrder: 1,
  },
  {
    id: 3,
    name: "Colorful Building Blocks",
    slug: "colorful-building-blocks",
    price: 29.99,
    sellingPrice: 29.99,
    costPrice: 20.49,
    category: "Toys",
    image:
      "https://images.unsplash.com/photo-1655087751207-1020c89f7eee?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw5fHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OXww&ixlib=rb-4.1.0&q=80&w=1080",
    description:
      "Safe, colorful blocks for developing motor skills and creativity",
    inStock: true,
    isFeatured: true,
    featuredSortOrder: 2,
  },
  {
    id: 4,
    name: "Rainbow Baby Dresses",
    slug: "rainbow-baby-dresses",
    price: 34.99,
    sellingPrice: 34.99,
    costPrice: 24.49,
    category: "Clothing",
    image:
      "https://images.unsplash.com/photo-1560506840-ec148e82a604?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description:
      "Beautiful collection of colorful dresses for special occasions",
    inStock: true,
    isFeatured: true,
    featuredSortOrder: 3,
  },
  {
    id: 5,
    name: "Baby Blue Romper",
    slug: "baby-blue-romper",
    price: 22.99,
    sellingPrice: 22.99,
    costPrice: 15.99,
    category: "Clothing",
    image:
      "https://images.unsplash.com/photo-1622290319146-7b63df48a635?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Comfortable and stylish blue romper for everyday wear",
    inStock: true,
    isFeatured: true,
    featuredSortOrder: 4,
  },
  {
    id: 6,
    name: "Colorful Baby Socks Set",
    slug: "colorful-baby-socks-set",
    price: 12.99,
    sellingPrice: 12.99,
    costPrice: 8.99,
    category: "Accessories",
    image:
      "https://images.unsplash.com/photo-1542355581-caf7454785ca?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw0fHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description:
      "Pack of 5 adorable colorful socks to keep tiny feet warm",
    inStock: true,
    isFeatured: true,
    featuredSortOrder: 5,
  },
  {
    id: 7,
    name: "Activity Play Mat",
    slug: "activity-play-mat",
    price: 49.99,
    sellingPrice: 49.99,
    costPrice: 35.49,
    category: "Toys",
    image:
      "https://images.unsplash.com/photo-1593793373220-2e51e1c31385?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw2fHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OXww&ixlib=rb-4.1.0&q=80&w=1080",
    description:
      "Interactive play mat with textures and colors for sensory development",
    inStock: true,
    isFeatured: true,
    featuredSortOrder: 6,
  },
  {
    id: 8,
    name: "Stuffed Animal Collection",
    slug: "stuffed-animal-collection",
    price: 39.99,
    sellingPrice: 39.99,
    costPrice: 27.99,
    category: "Toys",
    image:
      "https://images.unsplash.com/photo-1724703171978-bbe9c2ab70c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw3fHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OXww&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Set of adorable stuffed animals for imaginative play",
    inStock: true,
    isFeatured: true,
    featuredSortOrder: 7,
  },
  {
    id: 9,
    name: "White Dress & Shoes Set",
    slug: "white-dress-shoes-set",
    price: 44.99,
    sellingPrice: 44.99,
    costPrice: 31.49,
    category: "Clothing",
    image:
      "https://images.unsplash.com/photo-1684244160171-97f5dac39204?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw3fHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description:
      "Elegant white dress with matching shoes for special events",
    inStock: false,
    isFeatured: false,
    featuredSortOrder: 8,
  },
  {
    id: 10,
    name: "Colorful Onesie Pack",
    slug: "colorful-onesie-pack",
    price: 32.99,
    sellingPrice: 32.99,
    costPrice: 22.99,
    category: "Clothing",
    image:
      "https://images.unsplash.com/photo-1569974641446-22542de88536?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw4fHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Set of 3 colorful onesies for everyday comfort",
    inStock: true,
    isFeatured: false,
    featuredSortOrder: 9,
  },
  {
    id: 11,
    name: "Baby Gift Hamper",
    slug: "baby-gift-hamper",
    price: 89.99,
    sellingPrice: 89.99,
    costPrice: 63.99,
    category: "Accessories",
    image:
      "https://images.unsplash.com/photo-1635874714425-c342060a4c58?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxMHx8YmFieSUyMGNsb3RoZXN8ZW58MXx8fHwxNzc3NTMwNDk5fDA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Complete gift set with essentials for new parents",
    inStock: true,
    isFeatured: false,
    featuredSortOrder: 10,
  },
  {
    id: 12,
    name: "Educational Toy Set",
    slug: "educational-toy-set",
    price: 36.99,
    sellingPrice: 36.99,
    costPrice: 25.99,
    category: "Toys",
    image:
      "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxMHx8YmFieSUyMHByb2R1Y3RzJTIwdG95c3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Age-appropriate educational toys for early learning",
    inStock: true,
    isFeatured: false,
    featuredSortOrder: 11,
  },
];

export const CATEGORIES = ["All", "Toys", "Clothing", "Accessories"] as const;

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export function toNairaAmount(price: number) {
  return Math.round(price * 1000);
}

export function formatNaira(price: number) {
  return nairaFormatter.format(toNairaAmount(price));
}

export function formatNairaAmount(amount: number) {
  return nairaFormatter.format(Math.round(amount));
}

export function createProductSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function getProductSellingPrice(record: ProductRecord) {
  return Number(record.selling_price ?? record.price ?? 0);
}

export function getProductCostPrice(record: ProductRecord) {
  return Number(record.cost_price ?? record.selling_price ?? record.price ?? 0);
}

export function mapProductRecord(record: ProductRecord): StoreProduct {
  const sellingPrice = getProductSellingPrice(record);
  const costPrice = getProductCostPrice(record);
  const categories = normalizeProductCategoryLabels(record.category, record.categories);

  return {
    categories,
    id: Number(record.id),
    name: record.name,
    slug: record.slug?.trim() || createProductSlug(record.name) || `product-${record.id}`,
    price: sellingPrice,
    sellingPrice,
    costPrice,
    category: categories[0] ?? record.category,
    image: record.image,
    description: record.description,
    inStock: Boolean(record.in_stock),
    isFeatured: Boolean(record.is_featured),
    featuredSortOrder: Number(record.featured_sort_order ?? 0),
  };
}
