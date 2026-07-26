import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Footer } from "../../components/Footer";
import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import { ProductDetailPageClient } from "./ProductDetailPageClient";
import { getPublicProductBySlug } from "../../../lib/publicData";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);

  if (!product) {
    return {
      title: "Product Not Found | Nana's Baby Essentials",
      description: "The product you are looking for is no longer available.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: `${product.name} | Nana's Baby Essentials`,
    description: product.description,
    openGraph: {
      title: `${product.name} | Nana's Baby Essentials`,
      description: product.description,
      images: product.image ? [{ url: product.image, alt: product.name }] : undefined,
      type: "website",
    },
  };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return (
    <>
      <SiteHeaderShell />
      <ProductDetailPageClient product={product} />
      <Footer />
    </>
  );
}