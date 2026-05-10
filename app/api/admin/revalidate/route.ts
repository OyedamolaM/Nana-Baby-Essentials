import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdminRoute } from "@/lib/authServer";

type RevalidatePayload = {
  tags?: string[];
};

const ALLOWED_TAGS = new Set(["blog", "content", "orders", "products", "registries"]);

export async function POST(request: Request) {
  const admin = await requireAdminRoute(request);
  if (admin.response) {
    return admin.response;
  }

  const payload = (await request.json().catch(() => null)) as RevalidatePayload | null;
  const tags = (payload?.tags ?? []).filter((tag): tag is string => {
    return typeof tag === "string" && ALLOWED_TAGS.has(tag);
  });

  for (const tag of tags) {
    revalidateTag(tag, "max");
  }

  return NextResponse.json({
    message: "Revalidation queued.",
    tags,
  });
}
