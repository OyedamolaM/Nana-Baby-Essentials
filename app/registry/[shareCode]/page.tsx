"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Baby, CalendarClock, Gift, Share2 } from "lucide-react";
import { Footer } from "../../components/Footer";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";

interface PublicRegistryRecord {
  id: string;
  name: string;
  share_code: string;
  due_month?: string | null;
  baby_gender?: string | null;
  additional_info?: string | null;
}

function formatDueMonth(dueMonth?: string | null) {
  if (!dueMonth) {
    return "To be announced";
  }

  const date = new Date(`${dueMonth}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dueMonth
    : date.toLocaleDateString("en-NG", {
        month: "long",
        year: "numeric",
      });
}

function formatBabyGender(value?: string | null) {
  if (!value) {
    return "Not specified";
  }

  if (value === "neutral") {
    return "Surprise / Neutral";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function PublicRegistryPage() {
  const params = useParams<{ shareCode: string }>();
  const shareCode = params?.shareCode ?? "";
  const [loading, setLoading] = useState(() => Boolean(shareCode && hasSupabaseEnv));
  const [registry, setRegistry] = useState<PublicRegistryRecord | null>(null);

  useEffect(() => {
    if (!shareCode || !hasSupabaseEnv) {
      return;
    }

    const loadRegistry = async () => {
      const { data } = await supabase
        .from("registries")
        .select("*")
        .eq("share_code", shareCode)
        .maybeSingle();

      setRegistry((data as PublicRegistryRecord | null) ?? null);
      setLoading(false);
    };

    void loadRegistry();
  }, [shareCode]);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Baby className="h-8 w-8 text-pink-500" />
            <span className="text-2xl font-semibold text-gray-900">
              Baby Registry
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/registry">Browse Registry</Link>
            </Button>
            <Button asChild>
              <Link href="/">Back Home</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="bg-gradient-to-br from-pink-50 via-white to-blue-50 py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            {loading ? (
              <Card>
                <CardContent className="p-10 text-center text-gray-500">
                  Loading registry...
                </CardContent>
              </Card>
            ) : !hasSupabaseEnv ? (
              <Card>
                <CardContent className="p-10 text-center text-gray-500">
                  Connect Supabase to load public registry pages.
                </CardContent>
              </Card>
            ) : !registry ? (
              <Card>
                <CardContent className="space-y-4 p-10 text-center">
                  <h1 className="text-3xl font-bold text-gray-900">
                    Registry Not Found
                  </h1>
                  <p className="text-gray-600">
                    This registry link may be invalid or no longer available.
                  </p>
                  <Button asChild>
                    <Link href="/registry">Create or Browse Registries</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden shadow-xl">
                <CardContent className="space-y-8 p-8 md:p-10">
                  <div className="space-y-4 text-center">
                    <Badge variant="secondary" className="px-4 py-1 text-sm">
                      Shared Registry
                    </Badge>
                    <h1 className="text-4xl font-bold text-gray-900 md:text-5xl">
                      {registry.name}
                    </h1>
                    <p className="text-lg text-gray-600">
                      Celebrate this growing family with a thoughtful gift from
                      Nana&apos;s Baby Essentials.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-pink-50 p-5">
                      <p className="mb-2 text-sm font-medium uppercase tracking-[0.18em] text-pink-500">
                        Share Code
                      </p>
                      <p className="font-mono text-xl font-bold text-gray-900">
                        {registry.share_code}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 p-5">
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-blue-500">
                        <CalendarClock className="h-4 w-4" />
                        Due Month
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        {formatDueMonth(registry.due_month)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-purple-50 p-5">
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-purple-500">
                        <Gift className="h-4 w-4" />
                        Baby&apos;s Gender
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        {formatBabyGender(registry.baby_gender)}
                      </p>
                    </div>
                  </div>

                  {registry.additional_info && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6">
                      <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-gray-500">
                        A Note from the Parent
                      </p>
                      <p className="leading-relaxed text-gray-700">
                        {registry.additional_info}
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl bg-gray-50 p-6 text-center">
                    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-100">
                      <Share2 className="h-6 w-6 text-pink-600" />
                    </div>
                    <h2 className="mb-2 text-2xl font-bold text-gray-900">
                      Shop Registry Picks
                    </h2>
                    <p className="mx-auto mb-6 max-w-xl text-gray-600">
                      Browse popular baby essentials and choose something lovely
                      for this registry.
                    </p>
                    <Button asChild size="lg">
                      <Link href="/registry">View Registry Collection</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
