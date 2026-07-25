import { createHash, randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { requireAdminRoute } from "@/lib/authServer";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/productImageStorage";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

export const runtime = "nodejs";

const MAX_RAW_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;
const FULL_IMAGE_SIZE = 1600;
const THUMBNAIL_IMAGE_SIZE = 400;

type UploadedProductImage = {
  path: string;
  thumbnailPath: string;
  thumbnailUrl: string;
  url: string;
};

function getUploadScope(formData: FormData) {
  const rawProductId = formData.get("productId");
  const productId = typeof rawProductId === "string" ? Number(rawProductId) : NaN;
  if (Number.isSafeInteger(productId) && productId > 0) {
    return `product-${productId}`;
  }

  const rawUploadId = formData.get("uploadId");
  if (typeof rawUploadId === "string") {
    const normalized = rawUploadId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);

    if (normalized) {
      return normalized;
    }
  }

  return `upload-${randomUUID()}`;
}

function getImageFiles(formData: FormData) {
  const values = [
    ...formData.getAll("images"),
    ...formData.getAll("image"),
  ];

  return values.filter((value): value is File => value instanceof File);
}

async function compressImage(file: File) {
  const input = Buffer.from(await file.arrayBuffer());
  const source = sharp(input, { limitInputPixels: 40_000_000 }).rotate();

  const fullImage = await source
    .clone()
    .resize({
      width: FULL_IMAGE_SIZE,
      height: FULL_IMAGE_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
  const thumbnail = await source
    .clone()
    .resize({
      width: THUMBNAIL_IMAGE_SIZE,
      height: THUMBNAIL_IMAGE_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 75 })
    .toBuffer();

  return {
    fullImage,
    thumbnail,
    hash: createHash("sha256").update(fullImage).digest("hex"),
  };
}

async function uploadProductImage(
  file: File,
  uploadScope: string,
): Promise<UploadedProductImage> {
  const { fullImage, thumbnail, hash } = await compressImage(file);
  const path = `products/${uploadScope}/${hash}.webp`;
  const thumbnailPath = `thumbnails/products/${uploadScope}/${hash}.webp`;
  const client = createSupabaseServiceRoleClient();

  if (!client) {
    throw new Error("Supabase service role credentials are not configured.");
  }

  const { error: fullImageError } = await client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, fullImage, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: true,
    });

  if (fullImageError) {
    throw new Error(fullImageError.message);
  }

  const { error: thumbnailError } = await client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(thumbnailPath, thumbnail, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: true,
    });

  if (thumbnailError) {
    throw new Error(thumbnailError.message);
  }

  const { data: fullImageUrl } = client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(path);
  const { data: thumbnailUrl } = client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(thumbnailPath);

  return {
    path,
    thumbnailPath,
    thumbnailUrl: thumbnailUrl.publicUrl,
    url: fullImageUrl.publicUrl,
  };
}

export async function POST(request: Request) {
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

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ message: "Upload form data is required." }, { status: 400 });
  }

  const files = getImageFiles(formData);
  if (files.length === 0) {
    return NextResponse.json(
      { message: "Upload at least one image file." },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { message: `${file.name || "Each upload"} must be an image file.` },
        { status: 400 },
      );
    }

    if (file.size > MAX_RAW_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        {
          message: `${file.name || "Each image"} must be 15MB or smaller before compression.`,
        },
        { status: 400 },
      );
    }
  }

  const uploadScope = getUploadScope(formData);
  const images: UploadedProductImage[] = [];

  try {
    for (const file of files) {
      images.push(await uploadProductImage(file, uploadScope));
    }
  } catch (error) {
    console.error("Failed to process product image upload.", error);
    return NextResponse.json(
      {
        message:
          "Could not process this image. Please use a valid image file with safe dimensions and try again.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    images,
    message: images.length === 1 ? "Image uploaded successfully." : "Images uploaded successfully.",
  });
}
