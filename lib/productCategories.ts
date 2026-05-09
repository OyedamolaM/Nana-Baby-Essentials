export type ProductCategoryRecord = {
  created_at?: string | null;
  id: string;
  is_active?: boolean | null;
  label: string;
  slug: string;
  sort_order?: number | null;
};

export const DEFAULT_PRODUCT_CATEGORIES = ["Toys", "Clothing", "Accessories"] as const;

export function createCategorySlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function buildProductCategoryOptions(options: {
  includeInactive?: boolean;
  includeProductCategories?: string[];
  records?: ProductCategoryRecord[] | null;
}) {
  const labels = new Set<string>();

  (options.records ?? [])
    .filter((record) => {
      if (options.includeInactive) {
        return true;
      }

      return record.is_active !== false;
    })
    .sort((left, right) => {
      const sortDelta = Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);
      if (sortDelta !== 0) {
        return sortDelta;
      }

      return left.label.localeCompare(right.label);
    })
    .forEach((record) => {
      const label = record.label.trim();
      if (label) {
        labels.add(label);
      }
    });

  for (const label of options.includeProductCategories ?? []) {
    const normalizedLabel = label.trim();
    if (normalizedLabel) {
      labels.add(normalizedLabel);
    }
  }

  if (labels.size === 0) {
    for (const label of DEFAULT_PRODUCT_CATEGORIES) {
      labels.add(label);
    }
  }

  return Array.from(labels);
}

export function buildFilterCategoryOptions(options: {
  includeProductCategories?: string[];
  records?: ProductCategoryRecord[] | null;
}) {
  return ["All", ...buildProductCategoryOptions(options)];
}
