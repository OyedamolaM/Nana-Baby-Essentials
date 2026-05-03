"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Baby,
  Download,
  Gift,
  Globe,
  Heart,
  PartyPopper,
  Search,
  Share2,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORIES,
  SEED_PRODUCTS,
  mapProductRecord,
  type ProductRecord,
} from "../../lib/commerce";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { CategoryFilter } from "../components/CategoryFilter";
import { ProductCard, type Product } from "../components/ProductCard";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { ShoppingCartDrawer } from "../components/ShoppingCartDrawer";
import { CheckoutModal } from "../components/checkout/CheckoutModal";
import { CreateRegistryModal } from "../components/registry/CreateRegistryModal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";

interface CartItem extends Product {
  quantity: number;
}

interface RegistryRecord {
  id: string;
  share_code: string;
  name: string;
  whatsapp?: string | null;
  due_month?: string | null;
  baby_gender?: string | null;
  additional_info?: string | null;
  created_at: string;
}

function formatDueMonth(dueMonth?: string | null) {
  if (!dueMonth) {
    return "N/A";
  }

  const date = new Date(`${dueMonth}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dueMonth
    : date.toLocaleDateString("en-NG", {
        month: "long",
        year: "numeric",
      });
}

function formatBabyGender(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  if (value === "neutral") {
    return "Surprise / Neutral";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function RegistryLandingPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>(
    SEED_PRODUCTS.filter((product) => product.inStock),
  );
  const [productsLoading, setProductsLoading] = useState(hasSupabaseEnv);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [myRegistry, setMyRegistry] = useState<RegistryRecord | null>(null);

  const loadProducts = useCallback(async () => {
    if (!hasSupabaseEnv) {
      setProducts(SEED_PRODUCTS.filter((product) => product.inStock));
      setProductsLoading(false);
      return;
    }

    setProductsLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("in_stock", true)
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) {
      setProducts(SEED_PRODUCTS.filter((product) => product.inStock));
      setProductsLoading(false);
      return;
    }

    setProducts((data as ProductRecord[]).map(mapProductRecord));
    setProductsLoading(false);
  }, []);

  const loadMyRegistry = useCallback(async () => {
    if (!user || !hasSupabaseEnv) {
      setMyRegistry(null);
      return;
    }

    const { data } = await supabase
      .from("registries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setMyRegistry((data as RegistryRecord | null) ?? null);
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProducts();
      void loadMyRegistry();
    });
  }, [loadMyRegistry, loadProducts]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" || product.category === selectedCategory;
      const matchesSearch =
        searchQuery === "" ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [products, searchQuery, selectedCategory]);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setProductDetailOpen(true);
  };

  const handleAddToCart = (product: Product) => {
    setCartItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.id === product.id);

      if (existingItem) {
        toast.success(`Added another ${product.name} to cart.`);
        return currentItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      toast.success(`${product.name} added to cart.`);
      return [...currentItems, { ...product, quantity: 1 }];
    });
  };

  const handleRemoveItem = (productId: number) => {
    setCartItems((currentItems) =>
      currentItems.filter((item) => item.id !== productId),
    );
    toast.info("Item removed from cart.");
  };

  const handleUpdateQuantity = (productId: number, quantity: number) => {
    setCartItems((currentItems) =>
      currentItems.map((item) =>
        item.id === productId ? { ...item, quantity } : item,
      ),
    );
  };

  const handleCheckout = () => {
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const handleShareRegistry = async () => {
    if (!myRegistry) {
      return;
    }

    const shareUrl = `${window.location.origin}/registry/${myRegistry.share_code}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: myRegistry.name,
          text: "Check out my baby registry!",
          url: shareUrl,
        });
        return;
      } catch {
        // Fall back to clipboard below.
      }
    }

    await navigator.clipboard.writeText(shareUrl);
    toast.success("Registry link copied to clipboard!");
  };

  const handleDownloadChecklist = () => {
    toast.success("Baby checklist download started!");
  };

  const totalCartItems = cartItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const faqs = [
    {
      question: "How does the baby registry work?",
      answer:
        "Create your registry, add your favorite baby products, and share your unique link with family and friends. They can purchase items directly from your list, and you'll receive amazing rewards based on your registry total.",
    },
    {
      question: "What are the special offers?",
      answer:
        "When your registry orders hit N500,000, you'll receive a complimentary box of lactation cookies. When it reaches N1,000,000, you'll get 5% cashback on your entire registry.",
    },
    {
      question: "Can friends and family abroad shop from my registry?",
      answer:
        "Yes. Your personalized baby registry can be shared globally, so loved ones anywhere can shop for the exact items you want.",
    },
    {
      question: "How do I share my registry?",
      answer:
        "Once created, you'll receive a unique shareable link. You can share it via WhatsApp, email, social media, or any messaging platform.",
    },
    {
      question: "Can I update my registry after creating it?",
      answer:
        "Yes. You can add or remove products from your registry anytime through your profile dashboard.",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Baby className="h-8 w-8 text-pink-500" />
              <h1 className="text-2xl font-semibold text-gray-900">
                Baby Registry
              </h1>
            </Link>

            <nav className="hidden items-center gap-6 md:flex">
              <Link
                href="/"
                className="text-sm font-medium transition-colors hover:text-pink-600"
              >
                Home
              </Link>
              <a
                href="#products"
                className="text-sm font-medium transition-colors hover:text-pink-600"
              >
                Products
              </a>
              <a
                href="#faq"
                className="text-sm font-medium transition-colors hover:text-pink-600"
              >
                FAQ
              </a>
              <Link
                href="/blog"
                className="text-sm font-medium transition-colors hover:text-pink-600"
              >
                Blog
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="relative"
                onClick={() => setCartOpen(true)}
              >
                <ShoppingCart className="h-5 w-5" />
                {totalCartItems > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full p-0"
                  >
                    {totalCartItems}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="mb-6 text-5xl font-bold leading-tight text-gray-900 md:text-6xl">
              Create Your Perfect Baby Registry
            </h1>
            <p className="mb-4 text-xl leading-relaxed text-gray-600">
              Now your friends and family, home and abroad, can shop for the
              exact baby items you desire when you share your personalized baby
              registry with them!
            </p>
            <p className="mb-8 text-lg font-semibold text-pink-600">
              Get amazing rewards: Lactation cookies at N500k orders and 5%
              cashback at N1M orders
            </p>

            {myRegistry ? (
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button
                  size="lg"
                  onClick={handleShareRegistry}
                  className="px-8 text-lg"
                >
                  <Share2 className="mr-2 h-5 w-5" />
                  Share My Registry
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setShowCreateModal(true)}
                  className="px-8 text-lg"
                >
                  <Gift className="mr-2 h-5 w-5" />
                  Create New Registry
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button
                  size="lg"
                  onClick={() => setShowCreateModal(true)}
                  className="px-8 text-lg"
                >
                  <Gift className="mr-2 h-5 w-5" />
                  Create My Registry
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleDownloadChecklist}
                  className="px-8 text-lg"
                >
                  <Download className="mr-2 h-5 w-5" />
                  Download Baby Checklist
                </Button>
              </div>
            )}

            {myRegistry && (
              <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-pink-100 bg-white/80 p-6 text-left shadow-sm backdrop-blur">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-pink-500">
                      My Registry
                    </p>
                    <h2 className="mt-2 text-2xl font-bold text-gray-900">
                      {myRegistry.name}
                    </h2>
                  </div>
                  <Badge variant="secondary">{myRegistry.share_code}</Badge>
                </div>
                <div className="grid gap-3 text-sm text-gray-600 sm:grid-cols-3">
                  <div>
                    <p className="font-semibold text-gray-900">Due Month</p>
                    <p>{formatDueMonth(myRegistry.due_month)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Baby&apos;s Gender</p>
                    <p>{formatBabyGender(myRegistry.baby_gender)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">WhatsApp</p>
                    <p>{myRegistry.whatsapp || "Not provided"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white py-12">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
            <Card className="border-pink-200 bg-gradient-to-r from-pink-100 to-purple-100">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-full bg-white p-3">
                    <PartyPopper className="h-8 w-8 text-pink-600" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-xl font-bold text-gray-900">
                      N500,000 Registry Reward
                    </h3>
                    <p className="text-gray-700">
                      Receive a complimentary box of premium lactation cookies
                      when your registry orders hit N500,000.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-gradient-to-r from-blue-100 to-indigo-100">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-full bg-white p-3">
                    <Gift className="h-8 w-8 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-xl font-bold text-gray-900">
                      N1,000,000 Cashback Bonus
                    </h3>
                    <p className="text-gray-700">
                      Get 5% cashback on your entire registry when orders reach
                      N1,000,000.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="mb-12 text-center text-4xl font-bold text-gray-900">
            How It Works
          </h2>

          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-pink-100">
                  <Gift className="h-8 w-8 text-pink-600" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-gray-900">
                  1. Create Your Registry
                </h3>
                <p className="text-gray-600">
                  Fill in your details and our registry rep will call you within
                  24 hours to confirm.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
                  <Heart className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-gray-900">
                  2. Add Products
                </h3>
                <p className="text-gray-600">
                  Browse and add your favorite baby items to your personalized
                  registry.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                  <Globe className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-gray-900">
                  3. Share Globally
                </h3>
                <p className="text-gray-600">
                  Share your registry link with friends and family anywhere in
                  the world.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="products" className="bg-white py-20">
        <div className="container mx-auto px-4">
          <h2 className="mb-12 text-center text-4xl font-bold text-gray-900">
            Popular Registry Items
          </h2>

          <div className="mx-auto mb-8 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search for products..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="py-6 pl-10 text-lg"
              />
            </div>
          </div>

          <CategoryFilter
            categories={[...CATEGORIES]}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />

          {productsLoading ? (
            <div className="py-16 text-center">
              <p className="text-xl text-gray-500">Loading products...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-xl text-gray-500">
                No products found. Try a different search or category.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                  onViewDetails={handleProductClick}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="faq" className="bg-gray-50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="mb-12 text-center text-4xl font-bold text-gray-900">
            Frequently Asked Questions
          </h2>

          <div className="mx-auto max-w-3xl">
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={faq.question}
                  value={`item-${index}`}
                  className="rounded-lg border bg-white px-6"
                >
                  <AccordionTrigger className="text-left hover:no-underline">
                    <span className="font-semibold text-gray-900">
                      {faq.question}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-600">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-pink-500 to-purple-600 py-20 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-6 text-4xl font-bold md:text-5xl">
            Ready to Create Your Registry?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-xl">
            Start building your perfect baby registry today and let your loved
            ones celebrate with you.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setShowCreateModal(true)}
              className="px-8 text-lg"
            >
              <Gift className="mr-2 h-5 w-5" />
              Create Registry Now
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleDownloadChecklist}
              className="bg-white px-8 text-lg text-gray-900 hover:bg-gray-100"
            >
              <Download className="mr-2 h-5 w-5" />
              Download Checklist
            </Button>
          </div>
        </div>
      </section>

      <CreateRegistryModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          void loadMyRegistry();
        }}
      />

      <ShoppingCartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        cartItems={cartItems}
        onRemoveItem={handleRemoveItem}
        onUpdateQuantity={handleUpdateQuantity}
        onCheckout={handleCheckout}
      />

      <ProductDetailModal
        product={selectedProduct}
        open={productDetailOpen}
        onClose={() => setProductDetailOpen(false)}
        onAddToCart={handleAddToCart}
      />

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cartItems={cartItems}
        onCheckoutComplete={() => {
          setCartItems([]);
          void loadProducts();
        }}
      />
    </div>
  );
}
