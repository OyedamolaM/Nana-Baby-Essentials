import { Shield, Truck, HeadphonesIcon, Award } from "lucide-react";

export function About() {
  const values = [
    {
      icon: Shield,
      title: "Safe & Certified",
      description: "All products meet international safety standards"
    },
    {
      icon: Truck,
      title: "Fast Delivery",
      description: "Free shipping on orders above ₦50,000"
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
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-4xl font-bold text-gray-900 mb-6">
              Your Trusted Partner in Parenting
            </h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              At Baby Bliss, we understand that every parent wants the best for their little one. That&apos;s why we&apos;ve carefully selected premium baby products that combine safety, comfort, and style.
            </p>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              From the first onesie to their favorite teddy bear, we&apos;re here to make your parenting journey easier and more joyful. Our commitment to quality and customer satisfaction has made us Nigeria&apos;s most trusted baby store.
            </p>

            <div className="grid sm:grid-cols-2 gap-6">
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
              src="https://images.unsplash.com/photo-1522771930-78848d9293e8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw2fHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080"
              alt="Baby with parent"
              className="rounded-2xl shadow-lg h-64 w-full object-cover"
            />
            <img
              src="https://images.unsplash.com/photo-1647687663833-fcc91fd99792?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OHww&ixlib=rb-4.1.0&q=80&w=1080"
              alt="Baby playing"
              className="rounded-2xl shadow-lg h-64 w-full object-cover mt-8"
            />
            <img
              src="https://images.unsplash.com/photo-1709380830070-2c0da9348126?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OHww&ixlib=rb-4.1.0&q=80&w=1080"
              alt="Baby with toys"
              className="rounded-2xl shadow-lg h-64 w-full object-cover -mt-4"
            />
            <img
              src="https://images.unsplash.com/photo-1560506840-ec148e82a604?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080"
              alt="Baby clothes"
              className="rounded-2xl shadow-lg h-64 w-full object-cover mt-4"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
