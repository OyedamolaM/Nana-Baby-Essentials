import { Gift, Share2, Heart, CheckCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

interface BabyRegistryHighlightProps {
  onCreateRegistry: () => void;
}

export function BabyRegistryHighlight({
  onCreateRegistry,
}: BabyRegistryHighlightProps) {
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

        <div className="text-center">
          <Button size="lg" className="text-lg px-8" onClick={onCreateRegistry}>
            Create Your Registry
          </Button>
        </div>
      </div>
    </section>
  );
}
