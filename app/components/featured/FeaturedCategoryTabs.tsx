"use client";

import { useMemo, useState } from "react";

import { type StoreProduct } from "../../../lib/commerce";
import { ProductCard } from "../ProductCard";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

interface FeaturedCategoryTabsProps {
  products: StoreProduct[];
  onAddToCart: (product: StoreProduct, quantity?: number) => void;
  onViewProduct: (product: StoreProduct) => void;
  addLabel?: string;
  sectionTitle?: string;
  sectionSubtitle?: string;
}

export function FeaturedCategoryTabs({
  products,
  onAddToCart,
  onViewProduct,
  addLabel,
  sectionTitle = "Featured Categories",
  sectionSubtitle = "Browse featured products by category without leaving the page.",
}: FeaturedCategoryTabsProps) {
  const featuredProducts = useMemo(() => {
    const nextProducts = products.filter((product) => product.isFeatured);
    const source = nextProducts.length > 0 ? nextProducts : products;

    return [...source].sort((left, right) => {
      return left.featuredSortOrder - right.featuredSortOrder;
    });
  }, [products]);

  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set(featuredProducts.map((product) => product.category)))];
  }, [featuredProducts]);

  const [activeCategory, setActiveCategory] = useState<string>(categories[0] ?? "All");
  const visibleCategory = categories.includes(activeCategory)
    ? activeCategory
    : "All";

  const visibleProducts = visibleCategory === "All"
    ? featuredProducts
    : featuredProducts.filter((product) => product.category === visibleCategory);

  if (featuredProducts.length === 0 || categories.length === 0) {
    return null;
  }

  return (
    <section className="bg-white py-20">
      <div className="container mx-auto px-4">
        <div className="mb-10 text-center">
          <h2 className="text-4xl font-bold text-gray-900">{sectionTitle}</h2>
          <p className="mt-3 text-gray-600">{sectionSubtitle}</p>
        </div>

        <div className="mb-6 overflow-x-auto pb-2">
          <Tabs value={visibleCategory} onValueChange={setActiveCategory}>
            <TabsList className="inline-flex h-auto min-w-max gap-2 rounded-full bg-pink-50 p-1">
              {categories.map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="cursor-pointer rounded-full px-4"
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {visibleProducts.map((product) => (
            <ProductCard
              key={`${visibleCategory}-${product.id}`}
              product={product}
              addLabel={addLabel}
              onAddToCart={onAddToCart}
              onViewDetails={onViewProduct}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
