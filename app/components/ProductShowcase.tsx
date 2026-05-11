'use client'

import { Product, ProductCard } from "./ProductCard";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";

interface ProductShowcaseProps {
  products: Product[];
  onAddToCart: (product: Product, quantity?: number) => void;
  onViewProduct: (product: Product) => void;
  onViewAll: () => void;
}

export function ProductShowcase({
  products,
  onAddToCart,
  onViewProduct,
  onViewAll,
}: ProductShowcaseProps) {
  const featuredProducts = products.slice(0, 4);

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="section-title mb-2">
              Featured Products
            </h2>
            <p className="section-copy-lg">
              Hand-picked favorites for your little one
            </p>
          </div>
          <Button variant="outline" onClick={onViewAll} className="hidden md:flex">
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {featuredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={onAddToCart}
              onViewDetails={onViewProduct}
            />
          ))}
        </div>

        <div className="mt-8 text-center md:hidden">
          <Button onClick={onViewAll}>
            View All Products
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
