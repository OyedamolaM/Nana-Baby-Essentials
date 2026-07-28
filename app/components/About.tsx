import { Shield, Truck, HeadphonesIcon, Award } from "lucide-react";
import {
  DEFAULT_ABOUT_IMAGES,
  type HomepageImageAsset,
} from "../../lib/siteContent";

interface AboutProps {
  images?: HomepageImageAsset[];
}

export function About({ images = DEFAULT_ABOUT_IMAGES }: AboutProps) {
  const values = [
    {
      icon: Shield,
      title: "Safe & Certified",
      description: "All products meet international safety standards"
    },
    {
      icon: Truck,
      title: "Fast Delivery",
      description: "Get your essentials delivered to your doorstep in record time"
    },
    {
      icon: HeadphonesIcon,
      title: "24/7 Support",
      description: "Our team is always here to help you"
    },
    {
      icon: Award,
      title: "Premium Quality",
      description: "Carefully curated products from trusted brands"
    }
  ];

  return (
    <section className="bg-white py-14 md:py-20">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center md:text-left">
            <h2 className="section-title mb-6">
              Your Trusted Partner in{" "}
              <span className="brand-script">
                Parenting
              </span>
            </h2>
            <p className="section-copy-lg mx-auto mb-6 md:mx-0">
              At Nana&Apos;s Baby Essentials, we believe every parenting journey deserves a trusted companion. With over a decade of experience serving families, we&Apos;ve built our reputation by providing genuine, carefully selected baby and maternity products that parents can shop with confidence. Our commitment has always been to make every stage of pregnancy, infancy, and early childhood safer, easier, and more enjoyable.
            </p>
            <p className="section-copy-lg mx-auto mb-8 md:mx-0">
              From newborn essentials and nursery collections to feeding accessories, toys, fashion, and everyday parenting needs, every product we offer is chosen for its quality, safety, comfort, and value. We partner with trusted local and international brands so families can always access products they can rely on.
            </p>
            <p className="section-copy-lg mx-auto mb-8 md:mx-0">
              More than a baby store, Nana&Apos;s Baby Essentials is a brand built on trust, care, and lasting relationships with generations of parents. As we continue to grow, we remain committed to delivering exceptional service, innovative shopping experiences, and dependable support—helping families celebrate every milestone with confidence.
            </p>
            <div className="grid gap-6 text-left sm:grid-cols-2">
              {values.map((value, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg bg-pink-100 flex items-center justify-center">
                      <value.icon className="h-6 w-6 text-pink-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {value.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {value.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <img
              src={images[0]?.image ?? DEFAULT_ABOUT_IMAGES[0].image}
              alt={images[0]?.alt ?? DEFAULT_ABOUT_IMAGES[0].alt}
              className="rounded-2xl shadow-lg h-64 w-full object-cover"
            />
            <img
              src={images[1]?.image ?? DEFAULT_ABOUT_IMAGES[1].image}
              alt={images[1]?.alt ?? DEFAULT_ABOUT_IMAGES[1].alt}
              className="rounded-2xl shadow-lg h-64 w-full object-cover mt-8"
            />
            <img
              src={images[2]?.image ?? DEFAULT_ABOUT_IMAGES[2].image}
              alt={images[2]?.alt ?? DEFAULT_ABOUT_IMAGES[2].alt}
              className="rounded-2xl shadow-lg h-64 w-full object-cover -mt-4"
            />
            <img
              src={images[3]?.image ?? DEFAULT_ABOUT_IMAGES[3].image}
              alt={images[3]?.alt ?? DEFAULT_ABOUT_IMAGES[3].alt}
              className="rounded-2xl shadow-lg h-64 w-full object-cover mt-4"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
