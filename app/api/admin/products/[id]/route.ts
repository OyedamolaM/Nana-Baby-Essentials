import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdminRoute } from "@/lib/authServer";
import { deleteProductImageStorageObjects } from "@/lib/productImageStorage";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type RouteProps = {
  params: Promise<{ id: string }>;
};

function getProductId(value: string) {
  const productId = Number(value);
  return Number.isSafeInteger(productId) && productId > 0 ? productId : null;
}

export async function DELETE(request: Request, context: RouteProps) {
  const admin = await requireAdminRoute(request);
  if (admin.response) {
    return admin.response;
  }

  if (!hasSupabaseServiceRoleEnv) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const productId = getProductId((await context.params).id);
  if (!productId) {
    return NextResponse.json({ message: "Product not found." }, { status: 404 });
  }

  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { data: product, error: productError } = await serviceRoleClient
    .from("products")
    .select("id, image")
    .eq("id", productId)
    .eq("product_kind", "standard")
    .maybeSingle();

  if (productError || !product) {
    return NextResponse.json({ message: "Product not found." }, { status: 404 });
  }

  const { data: galleryImages, error: galleryError } = await serviceRoleClient
    .from("product_images")
    .select("url, thumbnail_url")
    .eq("product_id", productId);

  if (galleryError && galleryError.code !== "42P01") {
    console.error("Failed to read product gallery images before deleting product.", galleryError);
    return NextResponse.json(
      { message: "Could not delete the product right now." },
      { status: 500 },
    );
  }

  const { error: deleteError } = await serviceRoleClient
    .from("products")
    .delete()
    .eq("id", productId);

  if (deleteError) {
    console.error("Failed to delete product.", deleteError);
    return NextResponse.json(
      { message: "Could not delete the product right now." },
      { status: 500 },
    );
  }

  const cleanup = await deleteProductImageStorageObjects(serviceRoleClient, [
    { thumbnailUrl: product.image },
    ...((galleryImages ?? []).map((image) => ({
      url: image.url,
      thumbnailUrl: image.thumbnail_url,
    })) ?? []),
  ]);
  if (cleanup.error) {
    console.error("Product was deleted, but some Storage files could not be removed.", cleanup.error);
  }

  revalidateTag("products", "max");

  return NextResponse.json({
    cleanupPending: Boolean(cleanup.error),
    message: "Product deleted successfully.",
  });
}
