import { NextResponse } from "next/server";

import { getBearerToken } from "@/lib/authServer";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleEnv,
} from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const MIN_REVIEW_LENGTH = 10;
const MAX_REVIEW_LENGTH = 2000;
const MAX_NAME_LENGTH = 80;
const MAX_CONTACT_LENGTH = 160;
const MIN_SUBMIT_MS = 2000;

type ReviewSubmission = {
  email?: unknown;
  name?: unknown;
  phone?: unknown;
  rating?: unknown;
  reviewText?: unknown;
  source?: unknown;
  startedAt?: unknown;
  storeSlug?: unknown;
  website?: unknown;
};

function normalizeText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeRating(value: unknown) {
  const rating = Math.round(Number(value));
  if (!Number.isFinite(rating)) {
    return 5;
  }

  return Math.min(5, Math.max(1, rating));
}

async function resolveSignedInUserId(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return null;
  }

  const authClient = createSupabaseServerClient();
  if (!authClient) {
    return null;
  }

  const {
    data: { user },
  } = await authClient.auth.getUser(accessToken);

  return user?.id ?? null;
}

export async function POST(request: Request) {
  if (!hasSupabaseServiceRoleEnv) {
    return NextResponse.json(
      { message: "Reviews are not available right now." },
      { status: 500 },
    );
  }

  const payload = (await request.json().catch(() => null)) as ReviewSubmission | null;

  // Hidden field: real customers never fill this in.
  if (normalizeText(payload?.website, 200)) {
    return NextResponse.json({ message: "Thank you for your review." }, { status: 201 });
  }

  const startedAt = Number(payload?.startedAt);
  if (Number.isFinite(startedAt) && Date.now() - startedAt < MIN_SUBMIT_MS) {
    return NextResponse.json(
      { message: "Please take a moment to write your review, then submit again." },
      { status: 400 },
    );
  }

  const client = createSupabaseServiceRoleClient();
  if (!client) {
    return NextResponse.json(
      { message: "Reviews are not available right now." },
      { status: 500 },
    );
  }

  const userId = await resolveSignedInUserId(request);
  let profileName = "";
  let profileEmail = "";

  if (userId) {
    const { data: profile } = await client
      .from("user_profiles")
      .select("full_name, email, account_status, deleted_at")
      .eq("id", userId)
      .maybeSingle();

    const accountInactive =
      profile?.deleted_at || profile?.account_status === "disabled";
    if (profile && !accountInactive) {
      profileName = typeof profile.full_name === "string" ? profile.full_name : "";
      profileEmail = typeof profile.email === "string" ? profile.email : "";
    }
  }

  const name = normalizeText(payload?.name, MAX_NAME_LENGTH) || profileName;
  const email = normalizeText(payload?.email, MAX_CONTACT_LENGTH) || profileEmail;
  const phone = normalizeText(payload?.phone, MAX_CONTACT_LENGTH);
  const reviewText = normalizeText(payload?.reviewText, MAX_REVIEW_LENGTH);
  const storeSlug = normalizeText(payload?.storeSlug, MAX_NAME_LENGTH);
  const source = payload?.source === "qr" ? "qr" : "web";

  if (!name) {
    return NextResponse.json(
      { message: "Please add your name (or initials) with your review." },
      { status: 400 },
    );
  }

  if (reviewText.length < MIN_REVIEW_LENGTH) {
    return NextResponse.json(
      { message: "Please share a little more about your experience." },
      { status: 400 },
    );
  }

  if (email && !isValidEmail(email)) {
    return NextResponse.json(
      { message: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const { error } = await client.from("customer_reviews").insert({
    user_id: userId,
    reviewer_name: name,
    reviewer_email: email || null,
    reviewer_phone: phone || null,
    rating: normalizeRating(payload?.rating),
    review_text: reviewText,
    source,
    store_slug: storeSlug || null,
  });

  if (error) {
    console.error("Failed to save customer review.", error);
    return NextResponse.json(
      { message: "Could not send your review right now. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { message: "Thank you! Your review was sent for approval." },
    { status: 201 },
  );
}
