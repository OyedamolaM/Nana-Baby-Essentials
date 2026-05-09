"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Gift, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";

import { formatBabyGender, formatDueMonth, type RegistryRecord } from "../../lib/registry";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

interface BabyRegistryHighlightProps {
  onCreateRegistry: () => void;
}

export function BabyRegistryHighlight({ onCreateRegistry }: BabyRegistryHighlightProps) {
  const { user } = useAuth();
  const [registries, setRegistries] = useState<RegistryRecord[]>([]);
  const [loadingRegistries, setLoadingRegistries] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadRegistries = async () => {
      if (!user || !hasSupabaseEnv) {
        if (!cancelled) {
          setRegistries([]);
          setLoadingRegistries(false);
        }
        return;
      }

      setLoadingRegistries(true);

      const { data } = await supabase
        .from("registries")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!cancelled) {
        setRegistries((data as RegistryRecord[] | null) ?? []);
        setLoadingRegistries(false);
      }
    };

    void loadRegistries();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const latestRegistry = registries[0] ?? null;
  const features = [
    {
      icon: Gift,
      title: "Create Your Registry",
      description: "Build your perfect baby wishlist with products you love"
    },
    {
      icon: Share2,
      title: "Share with Loved Ones",
      description: "Get a unique link to share with family and friends"
    },
    {
      icon: Heart,
      title: "Track Purchases",
      description: "See what's been purchased and what's still needed"
    },
    {
      icon: CheckCircle,
      title: "Completion Discount",
      description: "Get 15% off remaining items after your event"
    }
  ];
  const hasExistingRegistry = Boolean(latestRegistry);

  const handleShareRegistry = async (registry: RegistryRecord) => {
    if (typeof window === "undefined") {
      return;
    }

    const shareUrl = `${window.location.origin}/registry/${registry.share_code}`;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Registry share link copied.");
  };

  const visibleRegistries = useMemo(() => registries.slice(0, 2), [registries]);

  return (
    <section className="py-20 bg-gradient-to-b from-white to-pink-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Baby Registry Made Simple
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Create and share your baby registry with ease. Let your friends and family celebrate your new arrival with the perfect gifts.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {features.map((feature, index) => (
            <Card key={index} className="border-2 hover:border-pink-300 transition-colors">
              <CardContent className="pt-6 text-center">
                <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100">
                  <feature.icon className="h-8 w-8 text-pink-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {hasExistingRegistry ? (
          <div className="mb-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" variant="outline" className="text-lg px-8" asChild>
              <Link href="/registry">Explore Registry Page</Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8" asChild>
              <Link href={`/dashboard/registries/${latestRegistry.id}`}>
                Open Existing Registry
              </Link>
            </Button>
            <Button size="lg" className="text-lg px-8" onClick={onCreateRegistry}>
              Create New Registry
            </Button>
          </div>
        ) : (
          <div className="mb-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Button size="lg" variant="outline" className="text-lg px-8" asChild>
              <Link href="/registry">Explore Registry Page</Link>
            </Button>
            <Button size="lg" className="text-lg px-8" onClick={onCreateRegistry}>
              Create New Registry
            </Button>
          </div>
        )}

        {loadingRegistries ? (
          <p className="text-center text-sm text-gray-500">
            Loading your registries...
          </p>
        ) : visibleRegistries.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {visibleRegistries.map((registry) => (
              <Card key={registry.id} className="border-2 border-pink-100 shadow-sm">
                <CardContent className="space-y-5 pt-6">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-600">
                      Your Registry Card
                    </p>
                    <h3 className="text-2xl font-bold text-gray-900">
                      {registry.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Share Code: {registry.share_code}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-pink-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-pink-700">
                        Due Month
                      </p>
                      <p className="mt-1 font-medium text-gray-900">
                        {formatDueMonth(registry.due_month)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-purple-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-purple-700">
                        Baby Gender
                      </p>
                      <p className="mt-1 font-medium text-gray-900">
                        {formatBabyGender(registry.baby_gender)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button className="sm:flex-1" asChild>
                      <Link href={`/dashboard/registries/${registry.id}`}>
                        Open Existing Registry
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="sm:flex-1"
                      onClick={() => void handleShareRegistry(registry)}
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Share Registry
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : user ? (
          <p className="text-center text-sm text-gray-500">
            Your first registry will appear here as a shareable card.
          </p>
        ) : (
          <p className="text-center text-sm text-gray-500">
            Sign in to create a registry and keep your share link handy on the homepage.
          </p>
        )}
      </div>
    </section>
  );
}
