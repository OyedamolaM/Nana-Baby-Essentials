'use client'

import { ShoppingCart } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { type StoreProduct, formatNaira } from "../../lib/commerce";
import { cn } from "./ui/utils";

export type Product = StoreProduct;

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, quantity?: number) => void;
  onViewDetails?: (product: Product) => void;
  addLabel?: string;
}

export function ProductCard({
  product,
  onAddToCart,
  onViewDetails,
  addLabel = "Add to Cart",
}: ProductCardProps) {
  const useCompactAddButton = addLabel.length > 12;
  const productCategories =
    product.categories && product.categories.length > 0
      ? product.categories
      : [product.category];
  const primaryCategory = productCategories[0] ?? product.category;
  const extraCategoryCount = Math.max(productCategories.length - 1, 0);

  return (
    <Card className="flex h-full min-w-0 flex-col gap-0 overflow-hidden transition-all hover:shadow-lg">
      <button
        type="button"
        className="block aspect-square w-full shrink-0 overflow-hidden bg-gray-100 text-left"
        onClick={() => onViewDetails?.(product)}
      >
        <ImageWithFallback
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform [@media(hover:hover)]:hover:scale-105"
        />
      </button>
      <CardContent className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs">
            {primaryCategory}
          </Badge>
          {extraCategoryCount > 0 ? (
            <Badge variant="outline" className="text-xs">
              +{extraCategoryCount} more
            </Badge>
          ) : null}
        </div>
        <button
          type="button"
          className="mb-1 min-h-[2.625rem] text-left text-base font-semibold leading-snug text-gray-900 line-clamp-2 transition-colors hover:text-pink-600 sm:min-h-[3rem] sm:text-lg"
          onClick={() => onViewDetails?.(product)}
        >
          {product.name}
        </button>
        <p className="min-h-10 text-sm leading-5 text-gray-600 line-clamp-2 sm:min-h-12 sm:leading-6">
          {product.description}
        </p>
        <p className="mt-auto pt-3 text-lg font-bold text-gray-900 sm:text-xl">
          {formatNaira(product.price)}
        </p>
      </CardContent>
      <CardFooter className="mt-auto grid gap-2 p-3 pt-0 sm:p-4 sm:pt-0">
        <Button
          type="button"
          className={cn(
            "min-h-11 w-full sm:min-h-12",
            useCompactAddButton &&
              "gap-1 px-2 text-[13px] sm:gap-2 sm:px-4 sm:text-sm",
          )}
          onClick={() => onAddToCart(product)}
          disabled={!product.inStock}
        >
          <ShoppingCart
            className={cn("h-4 w-4", useCompactAddButton && "h-3.5 w-3.5 sm:h-4 sm:w-4")}
          />
          {product.inStock ? addLabel : "Out of Stock"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full sm:min-h-12"
          onClick={() => onViewDetails?.(product)}
        >
          View Details
        </Button>
      </CardFooter>
    </Card>
  );
}
