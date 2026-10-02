"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

const MIN_REVIEW_LENGTH = 10;
const MAX_REVIEW_LENGTH = 2000;

export function ReviewForm({
  onDone,
  source = "web",
  storeSlug = "",
}: {
  onDone?: () => void;
  source?: "web" | "qr";
  storeSlug?: string;
}) {
  const { profile, user } = useAuth();
  const startedAtRef = useRef(0);
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Automatically fall back to email prefix or 'Verified User' if profile name is missing
  const nameFromProfile = profile?.full_name?.trim() || user?.email?.split("@")[0] || "Verified User";
  const name = user ? nameFromProfile : (nameInput ?? "");

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  const activeRating = hoverRating ?? rating;
  const trimmedReview = reviewText.trim();
  const canSubmit = !submitting && Boolean(name.trim()) && trimmedReview.length >= MIN_REVIEW_LENGTH;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      toast.error("Please add your name or initials.");
      return;
    }

    if (trimmedReview.length < MIN_REVIEW_LENGTH) {
      toast.error("Please share a little more about your experience.");
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch("/api/reviews", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name.trim(),
          email: user ? undefined : email.trim(),
          phone: user ? undefined : phone.trim(),
          rating,
          reviewText: trimmedReview,
          source,
          storeSlug,
          startedAt: startedAtRef.current,
          website,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        toast.error(payload?.message ?? "Could not send your review right now.");
        return;
      }

      setSubmitted(true);
    } catch (error) {
      console.error("Failed to submit review.", error);
      toast.error("Could not send your review right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="py-4 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-pink-500" />
        <h2 className="mt-4 text-xl font-semibold text-gray-950">
          Thank you for your review
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          We have received your feedback.
        </p>
        {onDone ? (
          <Button className="mt-6" onClick={onDone}>
            Done
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label>Your rating</Label>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              className="rounded-full p-1 transition-transform hover:scale-110"
              onMouseEnter={() => setHoverRating(value)}
              onMouseLeave={() => setHoverRating(null)}
              onClick={() => setRating(value)}
            >
              <Star
                className="h-7 w-7 text-amber-500"
                fill={value <= activeRating ? "currentColor" : "none"}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-text">Your review</Label>
        <Textarea
          id="review-text"
          value={reviewText}
          onChange={(event) => setReviewText(event.target.value)}
          maxLength={MAX_REVIEW_LENGTH}
          rows={5}
          placeholder="What did you buy, and how was your experience?"
          required
        />
      </div>

      {/* If logged in, hide name, email, and phone input details completely */}
      {!user && (
        <>
          <div className="space-y-2">
            <Label htmlFor="review-name">Your name</Label>
            <Input
              id="review-name"
              value={name}
              onChange={(event) => setNameInput(event.target.value)}
              maxLength={80}
              placeholder="e.g. Amaka O. or your initials"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="review-email">Email (optional)</Label>
              <Input
                id="review-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={160}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-phone">Phone (optional)</Label>
              <Input
                id="review-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={160}
                placeholder="e.g. 0801 234 5678"
              />
            </div>
          </div>
        </>
      )}

      <input
        type="text"
        name="website"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="flex justify-center pt-2">
        <Button type="submit" disabled={!canSubmit} className="min-w-full sm:min-w-36">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending
            </>
          ) : (
            "Submit review"
          )}
        </Button>
      </div>
    </form>
  );
}
