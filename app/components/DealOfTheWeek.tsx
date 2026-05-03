"use client";

import { useEffect, useState } from "react";
import { Clock, ShoppingCart, Zap } from "lucide-react";
import { Product } from "./ProductCard";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./ui/carousel";
import { useHomepageDeals } from "../hooks/useContentData";
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
  const deals = useHomepageDeals();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="bg-gradient-to-r from-orange-50 to-red-50 py-16">
      <div className="w-full px-3 sm:px-4">
        <div className="mb-8 flex items-center justify-center gap-2 text-center">
          <Zap className="h-7 w-7 sm:h-8 sm:w-8 fill-orange-600 text-orange-600" />
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Deals of the Week
          </h2>
          <Zap className="h-7 w-7 sm:h-8 sm:w-8 fill-orange-600 text-orange-600" />
        </div>

        <div className="w-full lg:max-w-6xl lg:mx-auto sm:px-6 md:px-10">
          <Carousel className="px-1 sm:px-0" opts={{ loop: deals.length > 1 }}>
            <CarouselContent>
              {deals.map((deal) => {
                const displayProduct: Product = {
                  ...deal.product,
                  price: deal.salePrice,
                };

                const compareAtPrice = Math.max(deal.compareAtPrice, deal.salePrice);
                const savings = toNairaAmount(compareAtPrice - deal.salePrice);
                const discount = Math.round(
                  ((compareAtPrice - deal.salePrice) / compareAtPrice) * 100
                );

                const endsAt = deal.endsAt
                  ? new Date(deal.endsAt).getTime()
                  : now + 3 * 24 * 60 * 60 * 1000;

                const timeLeft = getTimeLeft(endsAt);

                return (
                  <CarouselItem key={deal.id}>
                    <Card className="overflow-hidden border-4 border-orange-400 shadow-2xl">
                      <div className="grid gap-5 p-4 sm:p-6 md:grid-cols-2 md:p-8">
                        
                        {/* Image */}
                        <div className="relative">
                          <Badge className="absolute left-3 top-3 z-10 px-3 py-1 text-sm text-white">
                            {deal.badgeText}
                          </Badge>
                          <ImageWithFallback
                            src={deal.image}
                            alt={deal.title}
                            className="h-56 w-full rounded-lg object-cover sm:h-full"
                          />
                        </div>

                        {/* Content */}
                        <div className="flex flex-col justify-center space-y-3">
                          <div>
                            <Badge variant="secondary" className="mb-2 text-xs">
                              {displayProduct.category}
                            </Badge>
                            <h3 className="mb-1 text-xl sm:text-3xl font-bold text-gray-900">
                              {deal.title}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {deal.subtitle}
                            </p>
                          </div>

                          {/* Price */}
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-2xl sm:text-4xl font-bold text-orange-600">
                                {formatNaira(deal.salePrice)}
                              </span>
                              <span className="text-sm sm:text-2xl text-gray-400 line-through">
                                {formatNaira(compareAtPrice)}
                              </span>
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                                {discount}% OFF
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              Save {formatNairaAmount(savings)}
                            </p>
                          </div>

                          {/* Countdown */}
                          <div className="rounded-lg bg-gray-100 p-3">
                            <div className="mb-1 flex items-center gap-2">
                              <Clock className="h-4 w-4 text-orange-600" />
                              <span className="text-sm font-semibold text-gray-900">
                                Ends in:
                              </span>
                            </div>

                            <div className="grid grid-cols-4 gap-1 text-center">
                              {[
                                { label: "D", value: timeLeft.days },
                                { label: "H", value: timeLeft.hours },
                                { label: "M", value: timeLeft.minutes },
                                { label: "S", value: timeLeft.seconds },
                              ].map((unit) => (
                                <div key={`${deal.id}-${unit.label}`}>
                                  <div className="text-base sm:text-xl font-bold text-orange-600">
                                    {String(unit.value).padStart(2, "0")}
                                  </div>
                                  <div className="text-[10px] text-gray-600">
                                    {unit.label}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Buttons */}
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              size="lg"
                              className="min-h-11 flex-1 bg-orange-600 hover:bg-orange-700 text-sm"
                              onClick={() => onAddToCart(displayProduct)}
                            >
                              <ShoppingCart className="mr-1 h-4 w-4" />
                              Add
                            </Button>

                            <Button
                              size="lg"
                              variant="outline"
                              className="min-h-11 text-sm"
                              onClick={() => onViewDetails(displayProduct)}
                            >
                              Details
                            </Button>
                          </div>

                          <p className="text-center text-[10px] text-gray-500">
                            Limited stock
                          </p>
                        </div>
                      </div>
                    </Card>
                  </CarouselItem>
                );
              })}
            </CarouselContent>

            {/* Smaller mobile arrows */}
            {deals.length > 1 && (
              <>
                <CarouselPrevious className="-left-3 sm:-left-5 md:-left-12 size-8 sm:size-10 border-orange-200 bg-white text-orange-700 shadow-sm hover:bg-orange-50" />
                <CarouselNext className="-right-3 sm:-right-5 md:-right-12 size-8 sm:size-10 border-orange-200 bg-white text-orange-700 shadow-sm hover:bg-orange-50" /></>
            )}
          </Carousel>
        </div>
      </div>
    </section>
  );
}
