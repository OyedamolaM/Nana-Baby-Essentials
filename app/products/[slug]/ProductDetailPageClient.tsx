"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, HeartHandshake, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { type StoreProduct, formatNaira } from "../../../lib/commerce";
import { readProductDetailReturnContext } from "../../../lib/productDetailReturn";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { ImageWithFallback } from "../../components/figma/ImageWithFallback";
import { useStoreCart } from "../../contexts/StoreCartContext";

export function ProductDetailPageClient({
  product,
}: {
  product: StoreProduct;
}) {
  const router = useRouter();
  const { addItem } = useStoreCart();

  const handleAddToCart = () => {
    addItem(product, 1);
    toast.success(`${product.name} added to cart.`);
  };

  const handleBackToPreviousProductView = () => {
    const reopenContext = readProductDetailReturnContext();
    router.push(reopenContext?.originPath || "/products");
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="bg-gradient-to-br from-white via-pink-50/40 to-blue-50/40 py-12">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <Button type="button" variant="outline" size="sm" onClick={handleBackToPreviousProductView}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Previous Product View
            </Button>
            <Link href="/products" className="text-pink-600 hover:text-pink-700">
              View all products
            </Link>
            <Link href="/registry" className="text-pink-600 hover:text-pink-700">
              Explore the registry
            </Link>
            <Link href="/blog" className="text-pink-600 hover:text-pink-700">
              Read parenting tips
            </Link>
          </div>

          <div className="grid gap-10 rounded-[32px] border bg-white p-6 shadow-xl lg:grid-cols-[1.05fr_0.95fr] lg:p-10">
            <div className="overflow-hidden rounded-[28px] bg-gray-100">
              <ImageWithFallback
                src={product.image}
                alt={product.name}
                className="aspect-square w-full object-cover"
              />
            </div>

            <div className="space-y-6">
              <div>
                <Badge variant="secondary">{product.category}</Badge>
                <h1 className="mt-4 text-4xl font-bold text-gray-900">
                  {product.name}
                </h1>
                <p className="mt-4 text-3xl font-bold text-pink-600">
                  {formatNaira(product.price)}
                </p>
              </div>

              <p className="text-base leading-7 text-gray-600">
                {product.description}
              </p>

              <div className="rounded-2xl bg-gray-50 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Why Parents Love It
                </h2>
                <ul className="mt-4 space-y-2 text-sm text-gray-700">
                  <li>Thoughtfully selected for baby gifting and everyday use.</li>
                  <li>Works beautifully in both direct purchases and registry plans.</li>
                  <li>Pairs with our curated baby essentials and registry support.</li>
                </ul>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  className="flex-1"
                  onClick={handleAddToCart}
                  disabled={!product.inStock}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {product.inStock ? "Add to Cart" : "Out of Stock"}
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/registry">
                    <HeartHandshake className="mr-2 h-4 w-4" />
                    Add Through Registry
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 p-5 text-sm text-gray-700 sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-gray-900">Availability</p>
                  <p>{product.inStock ? "In stock" : "Currently unavailable"}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Product Link</p>
                  <p>Share this page directly with friends and family.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
