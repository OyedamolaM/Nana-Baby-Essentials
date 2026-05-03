import { NextResponse } from "next/server";

import {
  isValidEmail,
  normalizeEmail,
} from "@/lib/newsletter";
import {
  createSupabaseServerClient,
  hasSupabaseServerEnv,
} from "@/lib/supabaseServer";

type SubscribePayload = {
  email?: string;
  source?: string;
};

export async function POST(request: Request) {
  if (!hasSupabaseServerEnv) {
    return NextResponse.json(
      { message: "Supabase is not configured for newsletter subscriptions." },
      { status: 500 },
    );
  }

  const payload = (await request.json().catch(() => null)) as SubscribePayload | null;
  const email = normalizeEmail(payload?.email ?? "");

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase is not configured for newsletter subscriptions." },
      { status: 500 },
    );
  }

  const { error } = await supabase.from("newsletter_subscribers").insert({
    email,
    source: payload?.source?.trim() || "Blog Page",
  });

  if (error?.code === "23505") {
    return NextResponse.json({ message: "This email is already subscribed." });
  }

  if (error) {
    console.error("Failed to subscribe newsletter user.", error);
    return NextResponse.json(
      { message: "Could not save your subscription right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: "Thanks for subscribing to Nana's newsletter!",
  });
}
