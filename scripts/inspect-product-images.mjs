#!/usr/bin/env node

/**
 * Read-only inspection helper for a small sample of migrated product images.
 *
 * Examples:
 *   node scripts/inspect-product-images.mjs
 *   node scripts/inspect-product-images.mjs --limit=4 --save-dir=.tmp-product-image-inspection
 *
 * It never writes to Supabase or Storage. Passing --save-dir only writes the
 * sampled public files locally so they can be viewed at their native pixels.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 10;

function readDotEnv() {
  for (const filename of [".env", ".env.local"]) {
    const envPath = resolve(PROJECT_ROOT, filename);
    if (!existsSync(envPath)) {
      continue;
    }

    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      const separatorIndex = trimmed.indexOf("=");
      if (!trimmed || trimmed.startsWith("#") || separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function parseArguments(argumentsList) {
  let limit = DEFAULT_LIMIT;
  let saveDirectory;

  for (const argument of argumentsList) {
    if (argument.startsWith("--limit=")) {
      const value = Number(argument.slice("--limit=".length));
      if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_LIMIT) {
        throw new Error(`--limit must be a whole number from 1 to ${MAX_LIMIT}.`);
      }
      limit = value;
      continue;
    }

    if (argument.startsWith("--save-dir=")) {
      const value = argument.slice("--save-dir=".length).trim();
      if (!value) {
        throw new Error("--save-dir needs a directory path.");
      }
      saveDirectory = resolve(PROJECT_ROOT, value);
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { limit, saveDirectory };
}

async function fetchImage(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`${label} request returned HTTP ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  return { bytes, metadata };
}

function describeImage(image) {
  const width = image.metadata.width ?? "?";
  const height = image.metadata.height ?? "?";
  const kib = (image.bytes.length / 1024).toFixed(1);
  return `${width}x${height} ${image.metadata.format ?? "unknown"} ${kib} KiB`;
}

function safeFilename(productId, imageId, type) {
  return `${String(productId)}-${String(imageId)}-${type}.webp`;
}

async function main() {
  readDotEnv();
  const { limit, saveDirectory } = parseArguments(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: images, error } = await client
    .from("product_images")
    .select("id, product_id, url, thumbnail_url, sort_order, is_primary")
    .like("url", "%/storage/v1/object/public/product-images/%")
    .order("product_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Could not read product_images: ${error.message}`);
  }
  if (!images?.length) {
    console.log("No migrated product_images rows were found.");
    return;
  }

  const productIds = [...new Set(images.map((image) => image.product_id))];
  const { data: products, error: productsError } = await client
    .from("products")
    .select("id, image")
    .in("id", productIds);

  if (productsError) {
    throw new Error(`Could not read matching products: ${productsError.message}`);
  }

  const thumbnailByProductId = new Map(
    (products ?? []).map((product) => [String(product.id), product.image]),
  );
  if (saveDirectory) {
    mkdirSync(saveDirectory, { recursive: true });
  }

  console.log(`Inspecting ${images.length} full-size Storage image${images.length === 1 ? "" : "s"}.`);
  console.log("This is read-only: no database or Storage objects will be changed.\n");

  for (const image of images) {
    const productThumbnail = thumbnailByProductId.get(String(image.product_id));
    const [full, thumbnail] = await Promise.all([
      fetchImage(image.url, `Full image ${image.id}`),
      image.thumbnail_url ? fetchImage(image.thumbnail_url, `Thumbnail ${image.id}`) : null,
    ]);

    console.log(`Product ${image.product_id}, image ${image.id}${image.is_primary ? " (primary)" : ""}`);
    console.log(`  full URL: ${image.url}`);
    console.log(`  full file: ${describeImage(full)}`);
    console.log(`  thumbnail URL: ${image.thumbnail_url ?? "(none)"}`);
    console.log(`  thumbnail file: ${thumbnail ? describeImage(thumbnail) : "(none)"}`);
    console.log(
      `  products.image matches thumbnail: ${
        image.is_primary && productThumbnail === image.thumbnail_url ? "yes" : "no"
      }`,
    );

    if (saveDirectory) {
      writeFileSync(resolve(saveDirectory, safeFilename(image.product_id, image.id, "full")), full.bytes);
      if (thumbnail) {
        writeFileSync(
          resolve(saveDirectory, safeFilename(image.product_id, image.id, "thumbnail")),
          thumbnail.bytes,
        );
      }
    }
    console.log();
  }

  if (saveDirectory) {
    console.log(`Saved native-pixel samples to ${saveDirectory}`);
  }
}

main().catch((error) => {
  console.error(`Inspection failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
