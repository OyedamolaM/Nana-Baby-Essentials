"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle, Gift, Heart, Share2 } from "lucide-react";

import { type RegistryRecord } from "../../lib/registry";
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

  const hasExistingRegistry = registries.length > 0;
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
  return (
    <section className="bg-gradient-to-b from-white to-pink-50 py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold text-gray-900">
            Baby Registry Made Simple
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-gray-600">
            Create and share your baby registry with ease. Let your friends and family celebrate your new arrival with the perfect gifts.
          </p>
        </div>

        <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <Card key={index} className="border-2 hover:border-pink-300 transition-colors">
              <CardContent className="pt-6 text-center">
                <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100">
                  <feature.icon className="h-8 w-8 text-pink-600" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
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
          <div className="mx-auto mb-10 grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-3">
            <Button
              size="lg"
              variant="outline"
              className="w-full px-6 text-[14px] md:px-8 md:text-lg"
              asChild
            >
              <Link href="/registry">Explore Registry Page</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full px-6 text-[14px] md:px-8 md:text-lg"
              asChild
            >
              <Link href="/dashboard/registries">
                Open Existing Registry
              </Link>
            </Button>
            <Button
              size="lg"
              className="col-span-2 w-full px-6 text-[14px] md:col-span-1 md:px-8 md:text-lg"
              onClick={onCreateRegistry}
            >
              Create New Registry
            </Button>
          </div>
        ) : (
          <div className="mx-auto mb-10 grid max-w-2xl grid-cols-2 gap-3">
            <Button
              size="lg"
              variant="outline"
              className="w-full px-6 text-[14px] md:px-8 md:text-lg"
              asChild
            >
              <Link href="/registry">Explore Registry Page</Link>
            </Button>
            <Button
              size="lg"
              className="w-full px-6 text-[14px] md:px-8 md:text-lg"
              onClick={onCreateRegistry}
            >
              Create New Registry
            </Button>
          </div>
        )}

        {loadingRegistries ? (
          <p className="text-center text-sm text-gray-500">
            Loading your registries...
          </p>
        ) : user ? (
          <p className="text-center text-sm text-gray-500">
            Create a registry to manage it from your dashboard and share it with loved ones.
          </p>
        ) : (
          <p className="text-center text-sm text-gray-500">
            Sign in to create your registry and manage it from the registry page.
          </p>
        )}
      </div>
    </section>
  );
}
