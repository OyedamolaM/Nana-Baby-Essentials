import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type UpdateReviewPayload = {
  isActive?: boolean;
  rating?: number;
  reviewText?: string;
  reviewerName?: string;
  reviewerRole?: string | null;
  sortOrder?: number;
};

function getReviewTable(request: Request) {
  const surface = new URL(request.url).searchParams.get("surface");
  return surface === "registry" ? "registry_reviews" : "homepage_reviews";
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/reviews/[id]">,
) {
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

  const { id } = await context.params;
  const reviewTable = getReviewTable(request);
  const payload = (await request.json().catch(() => null)) as UpdateReviewPayload | null;
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload?.reviewerName !== undefined) {
    const reviewerName = payload.reviewerName.trim();
    if (!reviewerName) {
      return NextResponse.json(
        { message: "Reviewer name is required." },
        { status: 400 },
      );
    }

    updatePayload.reviewer_name = reviewerName;
  }

  if (payload?.reviewText !== undefined) {
    const reviewText = payload.reviewText.trim();
    if (!reviewText) {
      return NextResponse.json(
        { message: "Review text is required." },
        { status: 400 },
      );
    }

    updatePayload.review_text = reviewText;
  }

  if (payload?.reviewerRole !== undefined) {
    updatePayload.reviewer_role = payload.reviewerRole?.trim() || null;
  }

  if (payload?.rating !== undefined) {
    updatePayload.rating = Math.min(5, Math.max(1, Math.round(Number(payload.rating))));
  }

  if (payload?.sortOrder !== undefined) {
    updatePayload.sort_order = Math.max(0, Math.round(Number(payload.sortOrder)));
  }

  if (payload?.isActive !== undefined) {
    updatePayload.is_active = payload.isActive;
  }

  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await serviceRoleClient
    .from(reviewTable)
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("Failed to update review.", error);
    return NextResponse.json(
      { message: "Could not update the review right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    review: data,
    message: "Review updated successfully.",
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/admin/reviews/[id]">,
) {
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

  const { id } = await context.params;
  const reviewTable = getReviewTable(request);
  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { error } = await serviceRoleClient
    .from(reviewTable)
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete review.", error);
    return NextResponse.json(
      { message: "Could not delete the review right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: "Review deleted successfully.",
  });
}
