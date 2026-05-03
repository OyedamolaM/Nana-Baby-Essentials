"use client";

import { type StoreProduct } from "../../lib/commerce";
import { type CollectionWithProducts } from "../hooks/useContentData";
import { ProductCard } from "./ProductCard";

interface CollectionShowcaseProps {
  collections: CollectionWithProducts[];
  onAddToCart: (product: StoreProduct, quantity?: number) => void;
  onViewProduct: (product: StoreProduct) => void;
  addLabel?: string;
  sectionTitle?: string;
  sectionSubtitle?: string;
}

export function CollectionShowcase({
  collections,
  onAddToCart,
  onViewProduct,
  addLabel,
  sectionTitle = "Curated Collections",
  sectionSubtitle = "Fresh groupings our team can keep updating from the admin panel.",
}: CollectionShowcaseProps) {
  if (collections.length === 0) {
    return null;
  }

  return (
    <section className="bg-white py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-bold text-gray-900">{sectionTitle}</h2>
          <p className="mt-3 text-gray-600">{sectionSubtitle}</p>
        </div>

        <div className="space-y-12">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="rounded-3xl border border-pink-100 bg-gradient-to-br from-white via-pink-50/30 to-blue-50/40 p-6 shadow-sm"
            >
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-pink-500">
                    Collection
                  </p>
                  <h3 className="mt-2 text-3xl font-bold text-gray-900">
                    {collection.name}
                  </h3>
                  {collection.description && (
                    <p className="mt-3 text-gray-600">{collection.description}</p>
                  )}
                </div>
                {collection.heroImage ? (
                  <div
                    className="h-28 w-full rounded-2xl bg-cover bg-center md:w-56"
                    style={{ backgroundImage: `url(${collection.heroImage})` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>

              {collection.products.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-pink-200 bg-white/70 p-6 text-sm text-gray-500">
                  No products have been assigned to this collection yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
                  {collection.products.map((product) => (
                    <ProductCard
                      key={`${collection.id}-${product.id}`}
                      product={product}
                      addLabel={addLabel}
                      onAddToCart={onAddToCart}
                      onViewDetails={onViewProduct}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
