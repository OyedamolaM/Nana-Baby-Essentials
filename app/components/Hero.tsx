'use client'

import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";

interface HeroProps {
  onShopNow: () => void;
}

export function Hero({ onShopNow }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              Everything Your
              <span className="text-pink-600"> Little One </span>
              Deserves
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Premium baby products curated with love and care. From adorable clothing to educational toys, we&apos;ve got everything to make parenting easier and more joyful.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg" onClick={onShopNow} className="text-lg px-8">
                Shop Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8">
                Create Registry
              </Button>
            </div>
            <div className="flex gap-8 pt-4">
              <div>
                <p className="text-3xl font-bold text-gray-900">500+</p>
                <p className="text-gray-600">Products</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">10k+</p>
                <p className="text-gray-600">Happy Parents</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">4.9★</p>
                <p className="text-gray-600">Rating</p>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="relative z-10">
              <img
                src="https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxMHx8YmFieSUyMHByb2R1Y3RzJTIwdG95c3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080"
                alt="Happy baby with toys"
                className="rounded-3xl shadow-2xl"
              />
            </div>
            <div className="absolute -bottom-6 -right-6 w-72 h-72 bg-pink-300 rounded-full blur-3xl opacity-30"></div>
            <div className="absolute -top-6 -left-6 w-72 h-72 bg-blue-300 rounded-full blur-3xl opacity-30"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
