import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdminRoute } from "@/lib/authServer";
import {
  deleteProductImageStorageObjects,
  getProductImageStorageObjectPath,
} from "@/lib/productImageStorage";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type RouteProps = {
  params: Promise<{ id: string }>;
};

type ProductImageRow = {
  id: string;
  is_primary: boolean;
  sort_order: number;
  thumbnail_url?: string | null;
  url: string;
};

type AddProductImagePayload = {
  isPrimary?: boolean;
  isVariantOnly?: boolean;
  mode?: "append" | "replace-primary";
  path?: string;
  thumbnailPath?: string;
};

type UpdateProductImagesPayload = {
  action?: "set-primary" | "reorder";
  imageId?: string;
  imageIds?: string[];
};

function getProductId(value: string) {
  const productId = Number(value);
  return Number.isSafeInteger(productId) && productId > 0 ? productId : null;
}

function isMissingProductImagesTable(error: { code?: string } | null) {
  return error?.code === "42P01";
}

async function requireProduct(
  client: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>,
  productId: number,
) {
  const { data: product, error } = await client
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("product_kind", "standard")
    .maybeSingle();

  return { error, product };
}

async function readProductImages(
  client: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>,
  productId: number,
) {
  return client
    .from("product_images")
    .select("id, sort_order, url, thumbnail_url, is_primary")
    .eq("product_id", productId)
    .eq("is_variant_only", false)
    .order("sort_order", { ascending: true });
}

async function resolveRequestContext(request: Request, context: RouteProps) {
  const admin = await requireAdminRoute(request);
  if (admin.response) {
    return { response: admin.response };
  }

  if (!hasSupabaseServiceRoleEnv) {
    return {
      response: NextResponse.json(
        { message: "Supabase service role credentials are not configured." },
        { status: 500 },
      ),
    };
  }

  const productId = getProductId((await context.params).id);
  if (!productId) {
    return {
      response: NextResponse.json({ message: "Product not found." }, { status: 404 }),
    };
  }

  const client = createSupabaseServiceRoleClient();
  if (!client) {
    return {
      response: NextResponse.json(
        { message: "Supabase service role credentials are not configured." },
        { status: 500 },
      ),
    };
  }

  const { product, error } = await requireProduct(client, productId);
  if (error || !product) {
    return {
      response: NextResponse.json({ message: "Product not found." }, { status: 404 }),
    };
  }

  return { client, productId };
}

function invalidGalleryTableResponse() {
  return NextResponse.json(
    { message: "Run the product gallery migration before managing product images." },
    { status: 409 },
  );
}

async function insertProductImageWithRetry(
  client: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>,
  productId: number,
  payload: {
    is_primary: boolean;
    is_variant_only: boolean;
    thumbnail_url: string;
    url: string;
  },
  maxAttempts = 5,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: currentImages } = await client
      .from("product_images")
      .select("sort_order")
      .eq("product_id", productId)
      .eq("is_variant_only", payload.is_variant_only);

    const nextSortOrder =
      Math.max(-1, ...((currentImages ?? []) as { sort_order: number }[]).map((image) => Number(image.sort_order))) + 1;

    const result = await client
      .from("product_images")
      .insert({
        ...payload,
        product_id: productId,
        sort_order: nextSortOrder,
      })
      .select("id, sort_order, url, thumbnail_url, is_primary")
      .single();

    if (!result.error) {
      return result;
    }

    if (result.error.code !== "23505") {
      return result;
    }
  }

  return {
    data: null,
    error: { message: "Could not assign a gallery position after several attempts." },
  };
}

export async function POST(request: Request, context: RouteProps) {
  const resolved = await resolveRequestContext(request, context);
  if ("response" in resolved) {
    return resolved.response;
  }

  const payload = (await request.json().catch(() => null)) as AddProductImagePayload | null;
  const path = getProductImageStorageObjectPath(payload?.path);
  const thumbnailPath = getProductImageStorageObjectPath(payload?.thumbnailPath);

  if (
    !path?.startsWith("products/") ||
    !thumbnailPath?.startsWith("thumbnails/products/") ||
    thumbnailPath !== `thumbnails/${path}`
  ) {
    return NextResponse.json(
      { message: "The uploaded image paths are invalid." },
      { status: 400 },
    );
  }

  const { data: existingImages, error: existingImagesError } = await readProductImages(
    resolved.client,
    resolved.productId,
  );

  if (isMissingProductImagesTable(existingImagesError)) {
    return invalidGalleryTableResponse();
  }

  if (existingImagesError) {
    console.error("Failed to read product gallery images.", existingImagesError);
    return NextResponse.json(
      { message: "Could not update the product image right now." },
      { status: 500 },
    );
  }

  const images = (existingImages ?? []) as ProductImageRow[];
  const existingPrimary = images.find((image) => image.is_primary);
  const isVariantOnly = Boolean(payload?.isVariantOnly);
  const mode = payload?.mode === "append" ? "append" : "replace-primary";
  const isPrimary =
    !isVariantOnly && (images.length === 0 || mode === "replace-primary" || Boolean(payload?.isPrimary));
  const { data: publicImageUrl } = resolved.client.storage
    .from("product-images")
    .getPublicUrl(path);
  const { data: publicThumbnailUrl } = resolved.client.storage
    .from("product-images")
    .getPublicUrl(thumbnailPath);

  const saveResult =
    mode === "replace-primary" && existingPrimary && !isVariantOnly
      ? await resolved.client
          .from("product_images")
          .update({
            is_primary: true,
            thumbnail_url: publicThumbnailUrl.publicUrl,
            url: publicImageUrl.publicUrl,
          })
          .eq("id", existingPrimary.id)
          .eq("product_id", resolved.productId)
          .select("id, sort_order, url, thumbnail_url, is_primary")
          .single()
      : await insertProductImageWithRetry(resolved.client, resolved.productId, {
          is_primary: isPrimary,
          is_variant_only: isVariantOnly,
          thumbnail_url: publicThumbnailUrl.publicUrl,
          url: publicImageUrl.publicUrl,
  });

  if (saveResult.error || !saveResult.data) {
    console.error("Failed to save product gallery image.", saveResult.error);
    return NextResponse.json(
      { message: "Could not update the product image right now." },
      { status: 500 },
    );
  }

  if (mode === "replace-primary" && existingPrimary && !isVariantOnly) {
    const cleanup = await deleteProductImageStorageObjects(
      resolved.client,
      [{ thumbnailUrl: existingPrimary.thumbnail_url, url: existingPrimary.url }],
      [{ path, thumbnailPath }],
    );
    if (cleanup.error) {
      console.error(
        "Product image was replaced, but old Storage files could not be removed.",
        cleanup.error,
      );
    }
  }

  const { data: nextImages } = await readProductImages(
    resolved.client,
    resolved.productId,
  );
  revalidateTag("products", "max");

  return NextResponse.json({
    image: saveResult.data,
    images: nextImages ?? [],
    message: "Product image updated successfully.",
  });
}

export async function PATCH(request: Request, context: RouteProps) {
  const resolved = await resolveRequestContext(request, context);
  if ("response" in resolved) {
    return resolved.response;
  }

  const payload = (await request.json().catch(() => null)) as
    | UpdateProductImagesPayload
    | null;
  const { data: currentImages, error: currentImagesError } = await readProductImages(
    resolved.client,
    resolved.productId,
  );

  if (isMissingProductImagesTable(currentImagesError)) {
    return invalidGalleryTableResponse();
  }

  if (currentImagesError) {
    console.error("Failed to read product gallery images.", currentImagesError);
    return NextResponse.json(
      { message: "Could not update the product gallery right now." },
      { status: 500 },
    );
  }

  const images = (currentImages ?? []) as ProductImageRow[];
  if (payload?.action === "reorder") {
    const imageIds = Array.isArray(payload.imageIds) ? payload.imageIds : [];
    const expectedIds = new Set(images.map((image) => image.id));
    if (
      imageIds.length !== images.length ||
      new Set(imageIds).size !== imageIds.length ||
      imageIds.some((imageId) => !expectedIds.has(imageId))
    ) {
      return NextResponse.json(
        { message: "The product gallery order is invalid." },
        { status: 400 },
      );
    }

    const lowestSortOrder = Math.min(...images.map((image) => image.sort_order));
    for (const [index, imageId] of imageIds.entries()) {
      const { error } = await resolved.client
        .from("product_images")
        .update({ sort_order: lowestSortOrder - images.length - index - 1 })
        .eq("id", imageId)
        .eq("product_id", resolved.productId);
      if (error) {
        console.error("Failed to prepare product gallery reorder.", error);
        return NextResponse.json(
          { message: "Could not reorder the product gallery." },
          { status: 500 },
        );
      }
    }

    for (const [index, imageId] of imageIds.entries()) {
      const { error } = await resolved.client
        .from("product_images")
        .update({ sort_order: index })
        .eq("id", imageId)
        .eq("product_id", resolved.productId);
      if (error) {
        console.error("Failed to finalize product gallery reorder.", error);
        return NextResponse.json(
          { message: "Could not reorder the product gallery." },
          { status: 500 },
        );
      }
    }
  } else {
    const imageId = payload?.imageId?.trim() ?? "";
    if (!imageId || !images.some((image) => image.id === imageId)) {
      return NextResponse.json(
        { message: "Product image not found." },
        { status: 404 },
      );
    }

    const { error } = await resolved.client
      .from("product_images")
      .update({ is_primary: true })
      .eq("id", imageId)
      .eq("product_id", resolved.productId);

    if (error) {
      console.error("Failed to set the primary product image.", error);
      return NextResponse.json(
        { message: "Could not set the primary product image." },
        { status: 500 },
      );
    }
  }

  const { data: nextImages } = await readProductImages(
    resolved.client,
    resolved.productId,
  );
  revalidateTag("products", "max");

  return NextResponse.json({
    images: nextImages ?? [],
    message:
      payload?.action === "reorder"
        ? "Product gallery reordered successfully."
        : "Primary product image updated successfully.",
  });
}

export async function DELETE(request: Request, context: RouteProps) {
  const resolved = await resolveRequestContext(request, context);
  if ("response" in resolved) {
    return resolved.response;
  }

  const imageId = new URL(request.url).searchParams.get("imageId")?.trim();
  if (!imageId) {
    return NextResponse.json({ message: "Product image not found." }, { status: 404 });
  }

  const { data: image, error: imageError } = await resolved.client
    .from("product_images")
    .select("id, url, thumbnail_url")
    .eq("id", imageId)
    .eq("product_id", resolved.productId)
    .maybeSingle();

  if (isMissingProductImagesTable(imageError)) {
    return invalidGalleryTableResponse();
  }

  if (imageError || !image) {
    return NextResponse.json({ message: "Product image not found." }, { status: 404 });
  }

  const { error: deleteError } = await resolved.client
    .from("product_images")
    .delete()
    .eq("id", image.id);

  if (deleteError) {
    console.error("Failed to delete product gallery image.", deleteError);
    return NextResponse.json(
      { message: "Could not delete the product image right now." },
      { status: 500 },
    );
  }

  const cleanup = await deleteProductImageStorageObjects(resolved.client, [
    { thumbnailUrl: image.thumbnail_url, url: image.url },
  ]);
  if (cleanup.error) {
    console.error(
      "Product image was deleted, but its Storage files could not be removed.",
      cleanup.error,
    );
  }

  const { data: nextImages } = await readProductImages(
    resolved.client,
    resolved.productId,
  );
  revalidateTag("products", "max");

  return NextResponse.json({
    cleanupPending: Boolean(cleanup.error),
    images: nextImages ?? [],
    message: "Product image deleted successfully.",
  });
}