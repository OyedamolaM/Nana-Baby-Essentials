"use client";

import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";

import { type StoreProduct } from "../../../lib/commerce";
import { ProductCard } from "../ProductCard";
import { Button } from "../ui/button";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

interface FeaturedCategoryTabsProps {
  products: StoreProduct[];
  onAddToCart: (product: StoreProduct, quantity?: number) => void;
  onViewAll?: () => void;
  onViewProduct: (product: StoreProduct) => void;
  addLabel?: string;
  categories?: string[];
  sectionId?: string;
  sectionTitle?: string;
  sectionSubtitle?: string;
}

export function FeaturedCategoryTabs({
  products,
  onAddToCart,
  onViewAll,
  onViewProduct,
  addLabel,
  categories: initialCategories,
  sectionId,
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
    const labels = new Set<string>(
      (initialCategories ?? []).filter((category) => category !== "All"),
    );

    for (const product of featuredProducts) {
      labels.add(product.category);
    }

    return ["All", ...Array.from(labels)];
  }, [featuredProducts, initialCategories]);

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
    <section id={sectionId} className="section-spacing bg-white">
      <div className="container mx-auto px-4">
        <div className="mb-10 flex flex-col gap-4 text-center md:flex-row md:items-end md:justify-between md:text-left">
          <div>
            <h2 className="section-title">{sectionTitle}</h2>
            <p className="mt-3 text-base leading-7 text-gray-600">{sectionSubtitle}</p>
          </div>
          {onViewAll ? (
            <Button
              type="button"
              variant="outline"
              onClick={onViewAll}
              className="hidden text-[14px] md:inline-flex md:px-8 md:text-lg"
            >
              View All Products
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <div className="mb-6 overflow-x-auto pb-2">
          <Tabs value={visibleCategory} onValueChange={setActiveCategory}>
            <TabsList className="inline-flex h-auto min-w-max gap-2 rounded-full bg-pink-50 p-1">
              {categories.map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="cursor-pointer shrink-0 whitespace-nowrap rounded-full px-4"
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

        {onViewAll ? (
          <div className="mt-8 text-center md:hidden">
            <Button type="button" variant="outline" onClick={onViewAll} className="text-[14px]">
              View All Products
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
