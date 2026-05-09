'use client'

import { Button } from "./ui/button";

interface HeroProps {
  onCreateRegistry: () => void;
}

export function Hero({ onCreateRegistry }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <h1 className="text-5xl font-bold leading-tight text-gray-900 lg:text-6xl">
              Everything Your
              <span className="text-pink-600"> Little One </span>
              Deserves
            </h1>
            <p className="text-xl leading-relaxed text-gray-600">
              Premium baby products curated with love and care. From adorable clothing to educational toys, we&apos;ve got everything to make parenting easier and more joyful.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                className="px-8 text-lg"
                onClick={onCreateRegistry}
              >
                Create New Registry
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
                <p className="text-3xl font-bold text-gray-900">4.9/5</p>
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
            <div className="absolute -bottom-6 -right-6 h-72 w-72 rounded-full bg-pink-300 opacity-30 blur-3xl" />
            <div className="absolute -left-6 -top-6 h-72 w-72 rounded-full bg-blue-300 opacity-30 blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
