'use client'

import { ShoppingCart } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { type StoreProduct, formatNaira } from "../../lib/commerce";

export type Product = StoreProduct;

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, quantity?: number) => void;
  onViewDetails?: (product: Product) => void;
}

export function ProductCard({
  product,
  onAddToCart,
  onViewDetails,
}: ProductCardProps) {
  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg">
      <button
        type="button"
        className="aspect-square w-full overflow-hidden bg-gray-100 text-left"
        onClick={() => onViewDetails?.(product)}
      >
        <ImageWithFallback
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform hover:scale-105"
        />
      </button>
      <CardContent className="p-4">
        <div className="mb-2">
          <Badge variant="secondary" className="text-xs">
            {product.category}
          </Badge>
        </div>
        <button
          type="button"
          className="mb-1 text-left text-lg font-semibold text-gray-900 transition-colors hover:text-pink-600"
          onClick={() => onViewDetails?.(product)}
        >
          {product.name}
        </button>
        <p className="text-sm text-gray-600 line-clamp-2">{product.description}</p>
        <p className="mt-2 text-xl font-bold text-gray-900">{formatNaira(product.price)}</p>
      </CardContent>
      <CardFooter className="grid gap-2 p-4 pt-0">
        <Button
          type="button"
          className="w-full"
          onClick={() => onAddToCart(product)}
          disabled={!product.inStock}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          {product.inStock ? "Add to Cart" : "Out of Stock"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onViewDetails?.(product)}
        >
          View Details
        </Button>
      </CardFooter>
    </Card>
  );
}
