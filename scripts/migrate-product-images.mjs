#!/usr/bin/env node

/**
 * Manually migrate legacy products.image data URLs to compressed Supabase
 * Storage files. This script is intentionally not wired into any app command.
 *
 * Examples:
 *   node scripts/migrate-product-images.mjs --dry-run --limit=5
 *   node scripts/migrate-product-images.mjs --limit=5
 *   node scripts/migrate-product-images.mjs --limit=10
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "product-images";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 800;
const MAX_RAW_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;
const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readDotEnv() {
  const envPath = resolve(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseArguments(argumentsList) {
  let dryRun = false;
  let limit = BATCH_SIZE;

  for (const argument of argumentsList) {
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (argument.startsWith("--limit=")) {
      const value = Number(argument.slice("--limit=".length));
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error("--limit must be a positive whole number.");
      }

      limit = value;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { dryRun, limit };
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function decodeImageDataUrl(value) {
  const match = value.match(/^data:image\/[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error("The image is not a base64-encoded image data URL.");
  }

  const bytes = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (bytes.length === 0) {
    throw new Error("The image data URL did not contain any image bytes.");
  }

  if (bytes.length > MAX_RAW_IMAGE_SIZE_BYTES) {
    throw new Error("The decoded image exceeds the 15MB input limit.");
  }

  return bytes;
}

async function compressImage(input) {
  const source = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  const fullImage = await source
    .clone()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
  const thumbnail = await source
    .clone()
    .resize({
      width: 400,
      height: 400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 75 })
    .toBuffer();
  const hash = createHash("sha256").update(fullImage).digest("hex");

  return { fullImage, hash, thumbnail };
}

async function readCurrentImage(client, productId) {
  const { data, error } = await client
    .from("products")
    .select("image")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return typeof data?.image === "string" ? data.image : null;
}

async function uploadImages(client, productId, compressed) {
  const path = `products/${productId}/${compressed.hash}.webp`;
  const thumbnailPath = `thumbnails/products/${productId}/${compressed.hash}.webp`;

  const { error: fullImageError } = await client.storage.from(BUCKET).upload(
    path,
    compressed.fullImage,
    {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: true,
    },
  );
  if (fullImageError) {
    throw new Error(`Full image upload failed: ${fullImageError.message}`);
  }

  const { error: thumbnailError } = await client.storage.from(BUCKET).upload(
    thumbnailPath,
    compressed.thumbnail,
    {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: true,
    },
  );
  if (thumbnailError) {
    throw new Error(`Thumbnail upload failed: ${thumbnailError.message}`);
  }

  const { data: fullImageUrl } = client.storage.from(BUCKET).getPublicUrl(path);
  const { data: thumbnailUrl } = client.storage.from(BUCKET).getPublicUrl(thumbnailPath);

  return {
    path,
    thumbnailPath,
    thumbnailUrl: thumbnailUrl.publicUrl,
    url: fullImageUrl.publicUrl,
  };
}

async function removeUploadedImages(client, paths) {
  const { error } = await client.storage.from(BUCKET).remove(paths);
  if (error) {
    console.warn(`  Cleanup warning: ${error.message}`);
  }
}

async function migrateProduct(client, product, dryRun) {
  const originalImage = product.image;
  if (typeof originalImage !== "string" || !originalImage.startsWith("data:")) {
    return { status: "skipped" };
  }

  const decodedImage = decodeImageDataUrl(originalImage);
  const compressed = await compressImage(decodedImage);
  const path = `products/${product.id}/${compressed.hash}.webp`;
  const thumbnailPath = `thumbnails/products/${product.id}/${compressed.hash}.webp`;

  if (dryRun) {
    console.log(
      `DRY RUN product ${product.id}: ${decodedImage.length} bytes -> ${path} and ${thumbnailPath}`,
    );
    return { status: "succeeded" };
  }

  // Check before upload and immediately before the write so an admin edit is
  // not accidentally replaced by a stale migration row.
  if ((await readCurrentImage(client, product.id)) !== originalImage) {
    console.log(`SKIPPED product ${product.id}: image changed before upload.`);
    return { status: "skipped" };
  }

  const uploaded = await uploadImages(client, product.id, compressed);

  if ((await readCurrentImage(client, product.id)) !== originalImage) {
    console.log(`SKIPPED product ${product.id}: image changed during migration.`);
    await removeUploadedImages(client, [uploaded.path, uploaded.thumbnailPath]);
    return { status: "skipped" };
  }

  const { data: updatedProduct, error: updateError } = await client
    .from("products")
    .update({ image: uploaded.thumbnailUrl })
    .eq("id", product.id)
    .like("image", "data:%")
    .select("id, image")
    .maybeSingle();

  if (updateError) {
    await removeUploadedImages(client, [uploaded.path, uploaded.thumbnailPath]);
    throw new Error(`Database update failed: ${updateError.message}`);
  }

  if (!updatedProduct || updatedProduct.image !== uploaded.thumbnailUrl) {
    console.log(`SKIPPED product ${product.id}: image changed before the database update.`);
    await removeUploadedImages(client, [uploaded.path, uploaded.thumbnailPath]);
    return { status: "skipped" };
  }

  console.log(`MIGRATED product ${product.id}: ${uploaded.thumbnailUrl}`);
  return { status: "succeeded" };
}

async function main() {
  readDotEnv();
  const { dryRun, limit } = parseArguments(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. The service role key must never be exposed in the browser.",
    );
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const totals = { failed: 0, skipped: 0, succeeded: 0 };
  let processed = 0;
  let lastProductId = 0;

  console.log(
    `${dryRun ? "Dry run" : "Migration"} starting: up to ${limit} legacy product image${limit === 1 ? "" : "s"}, batches of ${BATCH_SIZE}.`,
  );

  while (processed < limit) {
    const batchLimit = Math.min(BATCH_SIZE, limit - processed);
    const { data: products, error } = await client
      .from("products")
      .select("id, image")
      .like("image", "data:%")
      .gt("id", lastProductId)
      .order("id", { ascending: true })
      .limit(batchLimit);

    if (error) {
      throw new Error(`Could not read legacy product images: ${error.message}`);
    }

    if (!products?.length) {
      break;
    }

    for (const product of products) {
      lastProductId = Number(product.id);
      processed += 1;

      try {
        const result = await migrateProduct(client, product, dryRun);
        totals[result.status] += 1;
      } catch (error) {
        totals.failed += 1;
        const message = error instanceof Error ? error.message : "Unknown failure";
        console.error(`FAILED product ${product.id}: ${message}`);
      }
    }

    if (products.length === batchLimit && processed < limit) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(
    `Summary: succeeded=${totals.succeeded}, failed=${totals.failed}, skipped=${totals.skipped}.`,
  );
  console.log(
    "Already migrated products are excluded by the data: filter and are safe to leave untouched on later runs.",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  console.error(`Migration stopped: ${message}`);
  process.exitCode = 1;
});
