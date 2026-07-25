import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdminRoute } from "@/lib/authServer";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type RouteProps = {
  params: Promise<{ id: string }>;
};

type VariantInput = {
  color?: unknown;
  id?: unknown;
  inStock?: unknown;
  priceOverride?: unknown;
  size?: unknown;
  sku?: unknown;
  stockQuantity?: unknown;
};

type SaveVariantsPayload = {
  deleteExistingVariants?: unknown;
  hasVariants?: unknown;
  variants?: unknown;
};

type ProductVariantRow = {
  color: string | null;
  id: string;
  in_stock: boolean;
  price_override: number | null;
  size: string | null;
  sku: string | null;
  stock_quantity: number;
};

type NormalizedVariant = {
  color: string | null;
  id: string | null;
  in_stock: boolean;
  price_override: number | null;
  size: string | null;
  sku: string | null;
  stock_quantity: number;
};

function getProductId(value: string) {
  const productId = Number(value);
  return Number.isSafeInteger(productId) && productId > 0 ? productId : null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePrice(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null;
}

function normalizeStockQuantity(value: unknown) {
  const quantity = Math.floor(Number(value));
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
}

function isMissingVariantsTable(error: { code?: string } | null) {
  return error?.code === "42P01";
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

  const { data: product, error } = await client
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("product_kind", "standard")
    .maybeSingle();

  if (error || !product) {
    return {
      response: NextResponse.json({ message: "Product not found." }, { status: 404 }),
    };
  }

  return { client, productId };
}

async function readProductVariants(
  client: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>,
  productId: number,
) {
  return client
    .from("product_variants")
    .select("id, size, color, sku, price_override, stock_quantity, in_stock")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
}

export async function GET(request: Request, context: RouteProps) {
  const resolved = await resolveRequestContext(request, context);
  if ("response" in resolved) {
    return resolved.response;
  }

  const { data: variants, error } = await readProductVariants(
    resolved.client,
    resolved.productId,
  );
  if (isMissingVariantsTable(error)) {
    return NextResponse.json(
      { message: "Run the product gallery and variants migration first." },
      { status: 409 },
    );
  }
  if (error) {
    console.error("Failed to read product variants.", error);
    return NextResponse.json(
      { message: "Could not load product variants." },
      { status: 500 },
    );
  }

  return NextResponse.json({ variants: variants ?? [] });
}

export async function PUT(request: Request, context: RouteProps) {
  const resolved = await resolveRequestContext(request, context);
  if ("response" in resolved) {
    return resolved.response;
  }

  const payload = (await request.json().catch(() => null)) as SaveVariantsPayload | null;
  const hasVariants = payload?.hasVariants === true;
  const deleteExistingVariants = payload?.deleteExistingVariants === true;
  const rawVariants = Array.isArray(payload?.variants) ? payload.variants : [];
  const normalizedVariants: NormalizedVariant[] = [];
  for (const [index, rawVariant] of rawVariants.entries()) {
    const variant = rawVariant as VariantInput;
    const stockQuantity = normalizeStockQuantity(variant.stockQuantity);
    const priceOverride = normalizePrice(variant.priceOverride);

    if (stockQuantity === null) {
      return NextResponse.json(
        { message: `Variant ${index + 1} needs a whole-number stock quantity.` },
        { status: 400 },
      );
    }

    if (variant.priceOverride !== null && variant.priceOverride !== undefined && variant.priceOverride !== "" && priceOverride === null) {
      return NextResponse.json(
        { message: `Variant ${index + 1} needs a valid price override.` },
        { status: 400 },
      );
    }

    normalizedVariants.push({
      color: normalizeText(variant.color),
      id: normalizeText(variant.id),
      in_stock: variant.inStock !== false && stockQuantity > 0,
      price_override: priceOverride,
      size: normalizeText(variant.size),
      sku: normalizeText(variant.sku),
      stock_quantity: stockQuantity,
    });
  }

  if (hasVariants && normalizedVariants.length === 0) {
    return NextResponse.json(
      { message: "Add at least one variant before enabling product options." },
      { status: 400 },
    );
  }

  const combinationKeys = new Set<string>();
  for (const variant of normalizedVariants) {
    const combinationKey = `${variant.size ?? ""}\u0000${variant.color ?? ""}`;
    if (combinationKeys.has(combinationKey)) {
      return NextResponse.json(
        { message: "Each size and color combination can only appear once." },
        { status: 400 },
      );
    }
    combinationKeys.add(combinationKey);
  }

  const { data: existingRows, error: existingError } = await readProductVariants(
    resolved.client,
    resolved.productId,
  );
  if (isMissingVariantsTable(existingError)) {
    return NextResponse.json(
      { message: "Run the product gallery and variants migration first." },
      { status: 409 },
    );
  }
  if (existingError) {
    console.error("Failed to read product variants before saving.", existingError);
    return NextResponse.json(
      { message: "Could not save product variants." },
      { status: 500 },
    );
  }

  const existingIds = new Set(
    ((existingRows as ProductVariantRow[] | null) ?? []).map((row) => row.id),
  );
  const submittedExistingIds = new Set(
    normalizedVariants
      .map((variant) => variant.id)
      .filter((id): id is string => Boolean(id && existingIds.has(id))),
  );

  if (!hasVariants && existingIds.size > 0 && !deleteExistingVariants) {
    return NextResponse.json(
      {
        message:
          "This product still has variants. Confirm deleting them before turning options off.",
      },
      { status: 409 },
    );
  }

  if (hasVariants) {
    for (const variant of normalizedVariants) {
      const variantPayload = {
        color: variant.color,
        in_stock: variant.in_stock,
        price_override: variant.price_override,
        product_id: resolved.productId,
        size: variant.size,
        sku: variant.sku,
        stock_quantity: variant.stock_quantity,
      };
      const saveResult = variant.id && existingIds.has(variant.id)
        ? await resolved.client
            .from("product_variants")
            .update(variantPayload)
            .eq("id", variant.id)
            .eq("product_id", resolved.productId)
        : await resolved.client.from("product_variants").insert(variantPayload);

      if (saveResult.error) {
        console.error("Failed to save product variant.", saveResult.error);
        return NextResponse.json(
          { message: saveResult.error.message || "Could not save a product variant." },
          { status: 500 },
        );
      }
    }
  }

  const idsToDelete = hasVariants
    ? Array.from(existingIds).filter((id) => !submittedExistingIds.has(id))
    : Array.from(existingIds);
  if (idsToDelete.length > 0) {
    const { error: deleteError } = await resolved.client
      .from("product_variants")
      .delete()
      .eq("product_id", resolved.productId)
      .in("id", idsToDelete);
    if (deleteError) {
      console.error("Failed to delete removed product variants.", deleteError);
      return NextResponse.json(
        { message: "Could not remove old product variants." },
        { status: 500 },
      );
    }
  }

  const { error: productUpdateError } = await resolved.client
    .from("products")
    .update({ has_variants: hasVariants })
    .eq("id", resolved.productId);
  if (productUpdateError) {
    console.error("Failed to update product variant mode.", productUpdateError);
    return NextResponse.json(
      { message: "Variants were saved, but the product setting could not be updated." },
      { status: 500 },
    );
  }

  const { data: variants } = await readProductVariants(
    resolved.client,
    resolved.productId,
  );
  revalidateTag("products", "max");

  return NextResponse.json({
    variants: variants ?? [],
    message: "Product variants saved successfully.",
  });
}
