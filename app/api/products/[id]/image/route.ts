import { NextResponse } from "next/server";

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabaseServer";

type ProductImageRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: ProductImageRouteProps) {
  const { id } = await params;
  const productId = Number(id);

  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return NextResponse.json({ message: "Product not found." }, { status: 404 });
  }

  const client = createSupabaseServiceRoleClient() ?? createSupabaseServerClient();
  if (!client) {
    return NextResponse.json({ message: "Product images are unavailable." }, { status: 503 });
  }

  const { data, error } = await client
    .from("products")
    .select("image")
    .eq("id", productId)
    .eq("product_kind", "standard")
    .maybeSingle<{ image?: string | null }>();

  const image = data?.image?.trim();
  if (error || !image) {
    return NextResponse.json({ message: "Product image not found." }, { status: 404 });
  }

  const dataUrl = image.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (dataUrl) {
    return new NextResponse(Buffer.from(dataUrl[2], "base64"), {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Type": dataUrl[1],
      },
    });
  }

  try {
    const imageUrl = new URL(image);
    if (imageUrl.protocol === "https:" || imageUrl.protocol === "http:") {
      return NextResponse.redirect(imageUrl, 307);
    }
  } catch {
    // Invalid image URLs are treated as missing images.
  }

  return NextResponse.json({ message: "Product image not found." }, { status: 404 });
}
