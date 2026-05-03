"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Baby,
  Download,
  Gift,
  Globe,
  Heart,
  Menu,
  PartyPopper,
  Search,
  Share2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES } from "../../lib/commerce";
import {
  formatBabyGender,
  formatDueMonth,
  mapRegistryItemRecord,
  type RegistryItem,
  type RegistryItemRecord,
  type RegistryRecord,
} from "../../lib/registry";
import { CollectionShowcase } from "../components/CollectionShowcase";
import { usePaginatedProducts } from "../hooks/usePaginatedProducts";
import { useActiveCollections } from "../hooks/useContentData";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { CategoryFilter } from "../components/CategoryFilter";
import { ProductCard, type Product } from "../components/ProductCard";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { AuthModal } from "../components/auth/AuthModal";
import { CreateRegistryModal } from "../components/registry/CreateRegistryModal";
import { RegistryBuilderDrawer } from "../components/registry/RegistryBuilderDrawer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Input } from "../components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../components/ui/pagination";

type AuthTab = "login" | "signup";

function buildPagination(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages] as const;
}

export function RegistryLandingPage() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState<AuthTab>("signup");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [myRegistry, setMyRegistry] = useState<RegistryRecord | null>(null);
  const [registryItems, setRegistryItems] = useState<RegistryItem[]>([]);
  const collections = useActiveCollections(4);
  const {
    loading: productsLoading,
    page,
    products,
    searchQuery,
    selectedCategory,
    setPage,
    setSearchQuery,
    setSelectedCategory,
    totalCount,
    totalPages,
  } = usePaginatedProducts({
    onlyInStock: true,
    pageSize: 16,
  });

  const openAuth = (tab: AuthTab) => {
    setAuthDefaultTab(tab);
    setAuthModalOpen(true);
  };

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

  const loadRegistryItems = useCallback(async () => {
    if (!myRegistry || !hasSupabaseEnv) {
      setRegistryItems([]);
      return;
    }

    const { data, error } = await supabase
      .from("registry_items")
      .select("*, products(*)")
      .eq("registry_id", myRegistry.id)
      .order("created_at", { ascending: false });

    if (error || !data) {
      setRegistryItems([]);
      return;
    }

    setRegistryItems((data as RegistryItemRecord[]).map(mapRegistryItemRecord));
  }, [myRegistry]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadMyRegistry();
    });
  }, [loadMyRegistry]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadRegistryItems();
    });
  }, [loadRegistryItems]);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setProductDetailOpen(true);
  };

  const handleAddToRegistry = async (product: Product, quantity = 1) => {
    if (!user) {
      toast.info("Sign in to start building your registry.");
      openAuth("signup");
      return;
    }

    if (!myRegistry) {
      toast.info("Create your registry first, then add products to it.");
      setShowCreateModal(true);
      return;
    }

    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    const existingItem = registryItems.find((item) => item.productId === product.id);

    if (existingItem) {
      const { error } = await supabase
        .from("registry_items")
        .update({
          requested_quantity: existingItem.requestedQuantity + quantity,
          unit_price_snapshot: product.price,
        })
        .eq("id", existingItem.id);

      if (error) {
        toast.error("Failed to update your registry item.");
        return;
      }

      setRegistryItems((currentItems) =>
        currentItems.map((item) =>
          item.id === existingItem.id
            ? {
                ...item,
                requestedQuantity: item.requestedQuantity + quantity,
                unitPriceSnapshot: product.price,
              }
            : item,
        ),
      );
    } else {
      const { data, error } = await supabase
        .from("registry_items")
        .insert({
          registry_id: myRegistry.id,
          product_id: product.id,
          requested_quantity: quantity,
          purchased_quantity: 0,
          unit_price_snapshot: product.price,
          note: "",
        })
        .select("*, products(*)")
        .single();

      if (error || !data) {
        toast.error("Failed to add this item to your registry.");
        return;
      }

      setRegistryItems((currentItems) => [
        mapRegistryItemRecord(data as RegistryItemRecord),
        ...currentItems,
      ]);
    }

    toast.success(`${product.name} added to your registry.`);
  };

  const handleRemoveRegistryItem = async (registryItemId: string) => {
    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    const { error } = await supabase
      .from("registry_items")
      .delete()
      .eq("id", registryItemId);

    if (error) {
      toast.error("Failed to remove this item from your registry.");
      return;
    }

    setRegistryItems((currentItems) =>
      currentItems.filter((item) => item.id !== registryItemId),
    );
    toast.success("Item removed from your registry.");
  };

  const handleUpdateRegistryQuantity = async (
    registryItemId: string,
    quantity: number,
  ) => {
    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    const { error } = await supabase
      .from("registry_items")
      .update({ requested_quantity: quantity })
      .eq("id", registryItemId);

    if (error) {
      toast.error("Failed to update this registry item.");
      return;
    }

    setRegistryItems((currentItems) =>
      currentItems.map((item) =>
        item.id === registryItemId
          ? { ...item, requestedQuantity: quantity }
          : item,
      ),
    );
  };

  const handleUpdateRegistryNote = async (registryItemId: string, note: string) => {
    if (!hasSupabaseEnv) {
      return;
    }

    setRegistryItems((currentItems) =>
      currentItems.map((item) =>
        item.id === registryItemId ? { ...item, note } : item,
      ),
    );

    await supabase
      .from("registry_items")
      .update({ note })
      .eq("id", registryItemId);
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
        // Fall back to clipboard.
      }
    }

    await navigator.clipboard.writeText(shareUrl);
    toast.success("Registry link copied to clipboard!");
  };

  const handleDownloadChecklist = () => {
    toast.success("Baby checklist download started!");
  };

  const paginationItems = useMemo(
    () => buildPagination(page, totalPages),
    [page, totalPages],
  );

  const faqs = [
    {
      question: "How does the baby registry work?",
      answer:
        "Create your registry, add your favorite baby products, and share your unique link with family and friends. They can purchase items directly from your list or contribute toward your registry.",
    },
    {
      question: "What are the special offers?",
      answer:
        "When your registry orders hit N500,000, you'll receive a complimentary box of lactation cookies. When it reaches N1,000,000, you'll get 5% cashback on your entire registry.",
    },
    {
      question: "Can friends and family abroad shop from my registry?",
      answer:
        "Yes. Your personalized baby registry can be shared globally, so loved ones anywhere can buy selected items or contribute a custom amount.",
    },
    {
      question: "How do I share my registry?",
      answer:
        "Once created, you'll receive a unique public link to your registry. You can share it through WhatsApp, email, social media, or any messaging platform.",
    },
    {
      question: "Can I update my registry after creating it?",
      answer:
        "Yes. Add, remove, and adjust registry items anytime from the registry page or your dashboard.",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="relative container mx-auto px-4">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Baby className="h-8 w-8 text-pink-500" />
              <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">
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
              {!user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden">
                      <User className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openAuth("login")}>
                      Sign In
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openAuth("signup")}>
                      Sign Up
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                className="hidden md:inline-flex"
                onClick={() => (user ? setBuilderOpen(true) : openAuth("signup"))}
              >
                <Gift className="mr-2 h-4 w-4" />
                My Registry
                {registryItems.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {registryItems.length}
                  </Badge>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="hidden md:inline-flex"
                onClick={() => (user ? setShowCreateModal(true) : openAuth("signup"))}
              >
                {myRegistry ? "New Registry" : "Start My Registry"}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen((current) => !current)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="absolute inset-x-0 top-full z-50 border-t bg-white px-4 py-4 shadow-xl md:hidden">
              <nav className="flex flex-col gap-3">
                <Link
                  href="/"
                  className="text-sm font-medium transition-colors hover:text-pink-600"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Home
                </Link>
                <a
                  href="#products"
                  className="text-sm font-medium transition-colors hover:text-pink-600"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Products
                </a>
                <a
                  href="#faq"
                  className="text-sm font-medium transition-colors hover:text-pink-600"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  FAQ
                </a>
                <Link
                  href="/blog"
                  className="text-sm font-medium transition-colors hover:text-pink-600"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Blog
                </Link>
              </nav>

              <div className="mt-4 flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (user) {
                      setBuilderOpen(true);
                    } else {
                      openAuth("signup");
                    }
                  }}
                >
                  <Gift className="mr-2 h-4 w-4" />
                  My Registry
                  {registryItems.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {registryItems.length}
                    </Badge>
                  )}
                </Button>
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (user) {
                      setShowCreateModal(true);
                    } else {
                      openAuth("signup");
                    }
                  }}
                >
                  {myRegistry ? "Create New Registry" : "Start My Registry"}
                </Button>
              </div>
            </div>
          )}
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
              registry with them.
            </p>
            <p className="mb-8 text-lg font-semibold text-pink-600">
              Get amazing rewards: Lactation cookies at N500k orders and 5%
              cashback at N1M orders.
            </p>

            {myRegistry ? (
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button size="lg" onClick={handleShareRegistry} className="px-8 text-lg">
                  <Share2 className="mr-2 h-5 w-5" />
                  Share My Registry
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setBuilderOpen(true)}
                  className="px-8 text-lg"
                >
                  <Gift className="mr-2 h-5 w-5" />
                  Open Registry Builder
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button
                  size="lg"
                  onClick={() => (user ? setShowCreateModal(true) : openAuth("signup"))}
                  className="px-8 text-lg"
                >
                  <Gift className="mr-2 h-5 w-5" />
                  Start My Registry
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
                    <p className="font-semibold text-gray-900">Wanted Items</p>
                    <p>{registryItems.length} selected</p>
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
                  2. Build Your Registry
                </h3>
                <p className="text-gray-600">
                  Add the items you want, set the quantities you need, and leave
                  helpful notes for your guests.
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
                  the world so they can buy items or contribute.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <CollectionShowcase
        collections={collections}
        onAddToCart={handleAddToRegistry}
        onViewProduct={handleProductClick}
        addLabel="Add to Registry"
        sectionTitle="Registry Collections"
        sectionSubtitle="Curated sets can be managed by your team in the admin dashboard while your category filter still handles the full catalog."
      />

      <section id="products" className="bg-white py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="text-4xl font-bold text-gray-900">
              Popular Registry Items
            </h2>
            <p className="mt-2 text-gray-600">
              {totalCount} products available for your registry list.
            </p>
          </div>

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
          ) : products.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-xl text-gray-500">
                No products found. Try a different search or category.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    addLabel="Add to Registry"
                    onAddToCart={handleAddToRegistry}
                    onViewDetails={handleProductClick}
                  />
                ))}
              </div>

              <Pagination className="mt-10">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#products"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page > 1) {
                          setPage(page - 1);
                        }
                      }}
                      aria-disabled={page === 1}
                      className={page === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>

                  {paginationItems.map((item, index) => (
                    <PaginationItem key={`${item}-${index}`}>
                      {item === "ellipsis" ? (
                        <PaginationEllipsis />
                      ) : (
                        <PaginationLink
                          href="#products"
                          isActive={item === page}
                          onClick={(event) => {
                            event.preventDefault();
                            setPage(Number(item));
                          }}
                        >
                          {item}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext
                      href="#products"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page < totalPages) {
                          setPage(page + 1);
                        }
                      }}
                      aria-disabled={page === totalPages}
                      className={
                        page === totalPages ? "pointer-events-none opacity-50" : ""
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </>
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
            Ready to Build and Share Your Registry?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-xl">
            Start building your registry today, then share one public link so
            your loved ones can gift items or contribute from anywhere.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              variant="secondary"
              onClick={() => (user ? setBuilderOpen(true) : openAuth("signup"))}
              className="px-8 text-lg"
            >
              <Gift className="mr-2 h-5 w-5" />
              Open Registry Builder
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
          toast.success("Your registry is ready. Start adding products to it.");
        }}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab={authDefaultTab}
      />

      <RegistryBuilderDrawer
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        registry={myRegistry}
        items={registryItems}
        onRemoveItem={handleRemoveRegistryItem}
        onUpdateQuantity={handleUpdateRegistryQuantity}
        onUpdateNote={handleUpdateRegistryNote}
        onShare={handleShareRegistry}
      />

      <ProductDetailModal
        product={selectedProduct}
        open={productDetailOpen}
        onClose={() => setProductDetailOpen(false)}
        onAddToCart={handleAddToRegistry}
        addActionLabel="Add to Registry"
      />
    </div>
  );
}
