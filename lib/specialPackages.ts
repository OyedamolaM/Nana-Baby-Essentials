import { mapProductRecord, type ProductRecord, type StoreProduct } from "./commerce";

export const SPECIAL_PACKAGE_TYPES = ["gift_bundle", "swoop_package"] as const;

export type SpecialPackageType = (typeof SPECIAL_PACKAGE_TYPES)[number];

export interface SpecialPackageRecord {
  badge_text?: string | null;
  created_at?: string;
  details?: string | null;
  external_video_url?: string | null;
  id: string;
  is_active: boolean;
  override_image?: string | null;
  package_type: SpecialPackageType;
  product_id: number;
  products?: ProductRecord | ProductRecord[] | null;
  slug: string;
  sort_order: number;
  subtitle?: string | null;
  title: string;
  updated_at?: string;
}

export interface SpecialPackage {
  badgeText: string;
  details: string;
  externalVideoUrl?: string | null;
  id: string;
  image: string;
  isActive: boolean;
  packageType: SpecialPackageType;
  product: StoreProduct;
  slug: string;
  sortOrder: number;
  subtitle: string;
  title: string;
}

function resolveProductRecord(value?: ProductRecord | ProductRecord[] | null) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function buildSpecialPackageTypeLabel(type: SpecialPackageType) {
  return type === "swoop_package" ? "Swoop Package" : "Gift Bundle";
}

export function normalizeExternalVideoUrl(value?: string | null) {
  const normalizedValue = value?.trim() ?? "";
  if (!normalizedValue) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedValue)) {
    return normalizedValue;
  }

  return `https://${normalizedValue.replace(/^\/+/, "")}`;
}

export function splitPackageDetails(value?: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function mapSpecialPackageRecord(
  record: SpecialPackageRecord,
  productOverride?: ProductRecord | null,
): SpecialPackage | null {
  const productRecord = productOverride ?? resolveProductRecord(record.products);
  if (!productRecord) {
    return null;
  }

  const product = mapProductRecord(productRecord);

  return {
    badgeText:
      record.badge_text?.trim() ||
      (record.package_type === "swoop_package" ? "Swoop Package" : "Gift Bundle"),
    details: record.details?.trim() || product.description,
    externalVideoUrl: normalizeExternalVideoUrl(record.external_video_url),
    id: record.id,
    image: record.override_image?.trim() || product.image,
    isActive: Boolean(record.is_active),
    packageType: record.package_type,
    product,
    slug: record.slug,
    sortOrder: Number(record.sort_order ?? 0),
    subtitle: record.subtitle?.trim() || product.description,
    title: record.title?.trim() || product.name,
  } satisfies SpecialPackage;
}

export function isSpecialPackage(value: SpecialPackage | null): value is SpecialPackage {
  return value !== null;
}
