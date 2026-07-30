import "server-only";

import { createHash } from "crypto";

import sharp from "sharp";

import { createSupabaseServiceRoleClient } from "./supabaseServer";

export const SITE_IMAGES_BUCKET = "site-images";
export const SITE_IMAGE_SCOPES = ["content", "deals", "packages", "locations"] as const;

export type SiteImageScope = (typeof SITE_IMAGE_SCOPES)[number];

const MAX_RAW_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_SIZE = 1600;

export function isSiteImageScope(value: unknown): value is SiteImageScope {
  return typeof value === "string" && SITE_IMAGE_SCOPES.includes(value as SiteImageScope);
}

export async function uploadSiteImage(file: File, scope: SiteImageScope) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are supported.");
  }

  if (file.size > MAX_RAW_IMAGE_SIZE_BYTES) {
    throw new Error("Image uploads must be 15MB or smaller.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  const image = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: MAX_IMAGE_SIZE,
      height: MAX_IMAGE_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
  const hash = createHash("sha256").update(image).digest("hex");
  const path = `${scope}/${hash}.webp`;
  const client = createSupabaseServiceRoleClient();

  if (!client) {
    throw new Error("Supabase service role credentials are not configured.");
  }

  const { error } = await client.storage.from(SITE_IMAGES_BUCKET).upload(path, image, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = client.storage.from(SITE_IMAGES_BUCKET).getPublicUrl(path);
  return {
    path,
    url: data.publicUrl,
  };
}
