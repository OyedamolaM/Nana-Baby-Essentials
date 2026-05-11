'use client'

import { Button } from "./ui/button";
import { DEFAULT_HERO_IMAGE, type HomepageImageAsset } from "../../lib/siteContent";

interface HeroProps {
  image?: HomepageImageAsset;
  onCreateRegistry: () => void;
  onGetSwoopPackage: () => void;
  onShopNow: () => void;
}

export function Hero({
  image = DEFAULT_HERO_IMAGE,
  onCreateRegistry,
  onGetSwoopPackage,
  onShopNow,
}: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 py-14 sm:py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6 text-center md:text-left">
            <h1 className="mx-auto max-w-2xl text-[30px] font-medium leading-tight tracking-tight text-neutral-900 md:mx-0 sm:text-5xl lg:text-[48px]">
              Everything Your
              <span className="brand-script">
                {" "}
                Little One{" "}
              </span>
              Deserves
            </h1>
            <p className="mx-auto max-w-2xl text-[14px] leading-relaxed text-gray-600 md:mx-0 sm:text-base lg:text-lg">
              Premium baby products curated with love and care. From adorable clothing to educational toys, we&apos;ve got everything to make parenting easier and more joyful.
            </p>
            <div className="flex flex-wrap justify-center gap-4 md:justify-start">
              <Button
                size="lg"
                variant="outline"
                className="px-6 text-[14px] md:px-8 md:text-lg"
                onClick={onShopNow}
              >
                Shop Now
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="px-6 text-[14px] md:px-8 md:text-lg"
                onClick={onGetSwoopPackage}
              >
                All in One Packages
              </Button>
              <Button
                size="lg"
                className="px-6 text-[14px] md:px-8 md:text-lg"
                onClick={onCreateRegistry}
              >
                Create New Registry
              </Button>
            </div>
            <div className="flex justify-center gap-8 pt-4 md:justify-start">
              <div>
                <p className="text-3xl font-bold text-gray-900">500+</p>
                <p className="text-gray-600">Products</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">10k+</p>
                <p className="text-gray-600">Happy Parents</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">4.9/5</p>
                <p className="text-gray-600">Rating</p>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="relative z-10">
              <img
                src={image.image}
                alt={image.alt}
                className="rounded-3xl shadow-2xl"
              />
            </div>
            <div className="absolute -bottom-6 -right-6 h-72 w-72 rounded-full bg-pink-300 opacity-30 blur-3xl" />
            <div className="absolute -left-6 -top-6 h-72 w-72 rounded-full bg-blue-300 opacity-30 blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
