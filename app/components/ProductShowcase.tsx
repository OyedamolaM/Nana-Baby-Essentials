'use client'

import { Product, ProductCard } from "./ProductCard";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";

interface ProductShowcaseProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
  onViewAll: () => void;
}

export function ProductShowcase({ products, onAddToCart, onViewAll }: ProductShowcaseProps) {
  const featuredProducts = products.slice(0, 4);

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-4xl font-bold text-gray-900 mb-2">
              Featured Products
            </h2>
            <p className="text-xl text-gray-600">
              Hand-picked favorites for your little one
            </p>
          </div>
          <Button variant="outline" onClick={onViewAll} className="hidden md:flex">
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={onAddToCart}
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
