#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "site-images";
const RESOURCES = ["content", "deals", "packages", "locations"];
const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_URL_PATTERN = /^data:image\/[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/i;

function readDotEnv() {
  const envPath = resolve(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArguments(argumentsList) {
  const options = {
    dryRun: false,
    limit: Number.POSITIVE_INFINITY,
    reportOrphans: false,
    resource: null,
  };

  for (const argument of argumentsList) {
    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--report-orphans") {
      options.reportOrphans = true;
    } else if (argument.startsWith("--limit=")) {
      const limit = Number(argument.slice("--limit=".length));
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new Error("--limit must be a positive whole number.");
      }
      options.limit = limit;
    } else if (argument.startsWith("--resource=")) {
      const resource = argument.slice("--resource=".length);
      if (!RESOURCES.includes(resource)) {
        throw new Error(`--resource must be one of: ${RESOURCES.join(", ")}.`);
      }
      options.resource = resource;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function isDataImage(value) {
  return typeof value === "string" && DATA_URL_PATTERN.test(value.trim());
}

function decodeDataImage(value) {
  const match = value.trim().match(DATA_URL_PATTERN);
  if (!match) throw new Error("Value is not a supported base64 image data URL.");
  return Buffer.from(match[1].replace(/\s/g, ""), "base64");
}

async function compressImage(value) {
  return sharp(decodeDataImage(value), { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
}

function getPublicUrl(client, path) {
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadImage(client, resource, value) {
  const image = await compressImage(value);
  const hash = createHash("sha256").update(image).digest("hex");
  const path = `${resource}/${hash}.webp`;
  const { error } = await client.storage.from(BUCKET).upload(path, image, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: true,
  });
  if (error) throw error;

  const url = getPublicUrl(client, path);
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) {
    throw new Error(`Uploaded object could not be verified (${response.status}).`);
  }
  return { path, url };
}

async function ensureBucket(client) {
  const options = {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    fileSizeLimit: 15 * 1024 * 1024,
    public: true,
  };
  const { data } = await client.storage.getBucket(BUCKET);
  if (data) {
    const { error } = await client.storage.updateBucket(BUCKET, options);
    if (error) throw error;
    return;
  }
  const { error } = await client.storage.createBucket(BUCKET, options);
  if (error) throw error;
}

async function collectCandidates(client, selectedResource) {
  const candidates = [];

  if (!selectedResource || selectedResource === "deals") {
    const { data, error } = await client.from("homepage_deals").select("id, override_image");
    if (error) throw error;
    for (const row of data ?? []) {
      if (!isDataImage(row.override_image)) continue;
      candidates.push({
        label: `homepage_deals:${row.id}`,
        resource: "deals",
        value: row.override_image,
        update: (url) => client.from("homepage_deals").update({ override_image: url }).eq("id", row.id),
      });
    }
  }

  if (!selectedResource || selectedResource === "packages") {
    const { data, error } = await client.from("special_packages").select("id, override_image");
    if (error) throw error;
    for (const row of data ?? []) {
      if (!isDataImage(row.override_image)) continue;
      candidates.push({
        label: `special_packages:${row.id}`,
        resource: "packages",
        value: row.override_image,
        update: (url) => client.from("special_packages").update({ override_image: url }).eq("id", row.id),
      });
    }
  }

  if (!selectedResource || selectedResource === "locations") {
    const { data, error } = await client.from("store_locations").select("id, hero_image");
    if (error) throw error;
    for (const row of data ?? []) {
      if (!isDataImage(row.hero_image)) continue;
      candidates.push({
        label: `store_locations:${row.id}`,
        resource: "locations",
        value: row.hero_image,
        update: (url) => client.from("store_locations").update({ hero_image: url }).eq("id", row.id),
      });
    }
  }

  if (!selectedResource || selectedResource === "content") {
    const { data, error } = await client
      .from("site_content_settings")
      .select("key, value")
      .in("key", ["hero_image", "about_images"]);
    if (error) throw error;

    for (const row of data ?? []) {
      let currentValue = structuredClone(row.value);
      const values = row.key === "about_images" && Array.isArray(currentValue)
        ? currentValue.map((entry, index) => ({ entry, index }))
        : [{ entry: currentValue, index: null }];

      for (const { entry, index } of values) {
        const image = entry && typeof entry === "object" ? entry.image : null;
        if (!isDataImage(image)) continue;

        candidates.push({
          label: `site_content_settings:${row.key}${index === null ? "" : `[${index}]`}`,
          resource: "content",
          value: image,
          update: async (url) => {
            const nextValue = structuredClone(currentValue);
            if (index === null) {
              nextValue.image = url;
            } else {
              nextValue[index] = { ...nextValue[index], image: url };
            }
            const result = await client
              .from("site_content_settings")
              .update({ value: nextValue })
              .eq("key", row.key);
            if (!result.error) currentValue = nextValue;
            return result;
          },
        });
      }
    }
  }

  return candidates;
}

function extractSiteImagePath(value) {
  if (typeof value !== "string") return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = value.indexOf(marker);
  return index >= 0 ? decodeURIComponent(value.slice(index + marker.length)) : null;
}

async function collectReferencedPaths(client) {
  const referenced = new Set();
  const add = (value) => {
    const path = extractSiteImagePath(value);
    if (path) referenced.add(path);
  };
  const [deals, packages, locations, settings] = await Promise.all([
    client.from("homepage_deals").select("override_image"),
    client.from("special_packages").select("override_image"),
    client.from("store_locations").select("hero_image"),
    client.from("site_content_settings").select("key, value").in("key", ["hero_image", "about_images"]),
  ]);
  for (const result of [deals, packages, locations, settings]) {
    if (result.error) throw result.error;
  }
  for (const row of deals.data ?? []) add(row.override_image);
  for (const row of packages.data ?? []) add(row.override_image);
  for (const row of locations.data ?? []) add(row.hero_image);
  for (const row of settings.data ?? []) {
    const entries = Array.isArray(row.value) ? row.value : [row.value];
    for (const entry of entries) add(entry?.image);
  }
  return referenced;
}

async function listStoredPaths(client, resource) {
  const paths = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client.storage.from(BUCKET).list(resource, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const object of data ?? []) {
      if (object.name.endsWith(".webp")) paths.push(`${resource}/${object.name}`);
    }
    if (!data || data.length < 1000) break;
    offset += data.length;
  }
  return paths;
}

async function reportOrphans(client, selectedResource) {
  const referenced = await collectReferencedPaths(client);
  const resources = selectedResource ? [selectedResource] : RESOURCES;
  const stored = (await Promise.all(resources.map((resource) => listStoredPaths(client, resource)))).flat();
  const orphaned = stored.filter((path) => !referenced.has(path));
  console.log(JSON.stringify({
    orphaned,
    orphanedCount: orphaned.length,
    referencedCount: referenced.size,
    storedCount: stored.length,
  }, null, 2));
}

async function main() {
  readDotEnv();
  const options = parseArguments(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (options.reportOrphans) {
    await reportOrphans(client, options.resource);
    return;
  }

  const candidates = await collectCandidates(client, options.resource);
  const selected = candidates.slice(0, options.limit);
  console.log(`Found ${candidates.length} base64 site image(s); selected ${selected.length}.`);
  if (options.dryRun) {
    for (const candidate of selected) console.log(`[dry-run] ${candidate.label}`);
    return;
  }

  await ensureBucket(client);
  let migrated = 0;
  let failed = 0;
  for (const candidate of selected) {
    try {
      const uploaded = await uploadImage(client, candidate.resource, candidate.value);
      const result = await candidate.update(uploaded.url);
      if (result.error) throw result.error;
      migrated += 1;
      console.log(`[migrated] ${candidate.label} -> ${uploaded.path}`);
    } catch (error) {
      failed += 1;
      console.error(`[failed] ${candidate.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Migration complete. Migrated: ${migrated}. Failed: ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
