"use client";

import { useEffect, useState } from "react";
import { Clock, ShoppingCart, Zap } from "lucide-react";
import { Product } from "./ProductCard";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { formatNaira, formatNairaAmount, toNairaAmount } from "../../lib/commerce";

interface DealOfTheWeekProps {
  onAddToCart: (product: Product) => void;
  onViewDetails: (product: Product) => void;
}

function getTimeLeft(targetTime: number) {
  const difference = Math.max(targetTime - Date.now(), 0);
  const totalSeconds = Math.floor(difference / 1000);

  const days = Math.floor(totalSeconds / (60 * 60 * 24));
  const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

export function DealOfTheWeek({
  onAddToCart,
  onViewDetails,
}: DealOfTheWeekProps) {
  const [dealEndsAt] = useState(
    () => Date.now() + (((3 * 24 + 12) * 60 + 45) * 60 + 30) * 1000,
  );
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(dealEndsAt));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft(getTimeLeft(dealEndsAt));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [dealEndsAt]);

  const dealProduct: Product = {
    id: 999,
    name: "Premium Baby Gift Set",
    price: 89.99,
    category: "Accessories",
    image:
      "https://images.unsplash.com/photo-1635874714425-c342060a4c58?w=800",
    description:
      "Complete premium gift set including organic onesies, soft toys, blankets, and more for new parents.",
    inStock: true,
  };

  const originalPrice = 149.99;
  const discount = Math.round(
    ((originalPrice - dealProduct.price) / originalPrice) * 100,
  );
  const savings = toNairaAmount(originalPrice - dealProduct.price);

  return (
    <section className="bg-gradient-to-r from-orange-50 to-red-50 py-16">
      <div className="container mx-auto px-4">
        <div className="mb-8 flex items-center justify-center gap-2 text-center">
          <Zap className="h-8 w-8 fill-orange-600 text-orange-600" />
          <h2 className="text-4xl font-bold text-gray-900">Deal of the Week</h2>
          <Zap className="h-8 w-8 fill-orange-600 text-orange-600" />
        </div>

        <Card className="mx-auto max-w-5xl overflow-hidden border-4 border-orange-400 shadow-2xl">
          <div className="grid gap-6 p-6 md:grid-cols-2 md:p-8">
            <div className="relative">
              <Badge className="absolute left-4 top-4 z-10 px-4 py-2 text-lg text-white">
                {discount}% OFF
              </Badge>
              <ImageWithFallback
                src={dealProduct.image}
                alt={dealProduct.name}
                className="h-full w-full rounded-lg object-cover"
              />
            </div>

            <div className="flex flex-col justify-center space-y-4">
              <div>
                <Badge variant="secondary" className="mb-2">
                  {dealProduct.category}
                </Badge>
                <h3 className="mb-2 text-3xl font-bold text-gray-900">
                  {dealProduct.name}
                </h3>
                <p className="leading-relaxed text-gray-600">
                  {dealProduct.description}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-orange-600">
                    {formatNaira(dealProduct.price)}
                  </span>
                  <span className="text-2xl text-gray-400 line-through">
                    {formatNaira(originalPrice)}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  You save {formatNairaAmount(savings)}.
                </p>
              </div>

              <div className="rounded-lg bg-gray-100 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  <span className="font-semibold text-gray-900">
                    Deal ends in:
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "Days", value: timeLeft.days },
                    { label: "Hours", value: timeLeft.hours },
                    { label: "Minutes", value: timeLeft.minutes },
                    { label: "Seconds", value: timeLeft.seconds },
                  ].map((unit) => (
                    <div key={unit.label}>
                      <div className="text-2xl font-bold text-orange-600">
                        {String(unit.value).padStart(2, "0")}
                      </div>
                      <div className="text-xs text-gray-600">{unit.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="flex-1 bg-orange-600 hover:bg-orange-700"
                  onClick={() => onAddToCart(dealProduct)}
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Add to Cart
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => onViewDetails(dealProduct)}
                >
                  View Details
                </Button>
              </div>

              <p className="text-center text-xs text-gray-500">
                Limited stock available. Deal valid while supplies last.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
