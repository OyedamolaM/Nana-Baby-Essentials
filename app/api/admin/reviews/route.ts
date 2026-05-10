import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

type CreateReviewPayload = {
  isActive?: boolean;
  rating?: number;
  reviewText?: string;
  reviewerName?: string;
  reviewerRole?: string;
  sortOrder?: number;
};

export async function POST(request: Request) {
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

  const payload = (await request.json().catch(() => null)) as CreateReviewPayload | null;
  const reviewerName = payload?.reviewerName?.trim() ?? "";
  const reviewText = payload?.reviewText?.trim() ?? "";

  if (!reviewerName || !reviewText) {
    return NextResponse.json(
      { message: "Reviewer name and review text are required." },
      { status: 400 },
    );
  }

  const rating = Math.min(5, Math.max(1, Math.round(Number(payload?.rating ?? 5))));

  const serviceRoleClient = createSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    return NextResponse.json(
      { message: "Supabase service role credentials are not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await serviceRoleClient
    .from("homepage_reviews")
    .insert({
      reviewer_name: reviewerName,
      reviewer_role: payload?.reviewerRole?.trim() || null,
      review_text: reviewText,
      rating,
      sort_order: Math.max(0, Math.round(Number(payload?.sortOrder ?? 0))),
      is_active: payload?.isActive ?? true,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("Failed to create homepage review.", error);
    return NextResponse.json(
      { message: "Could not create the review right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    review: data,
    message: "Review created successfully.",
  });
}
