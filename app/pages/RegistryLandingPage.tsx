"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Gift, Search, Share2 } from "lucide-react";
import { toast } from "sonner";

import { CATEGORIES, type StoreProduct } from "../../lib/commerce";
import { type HomepageDeal } from "../../lib/content";
import {
  addRegistryCartItem,
  clearRegistryCart,
  readRegistryCart,
  removeRegistryCartItem,
  updateRegistryCartQuantity,
  type RegistryCartItem,
} from "../../lib/registryCart";
import {
  buildRegistryDashboardPath,
  formatBabyGender,
  formatDueMonth,
  type RegistryRecord,
} from "../../lib/registry";
import { CategoryFilter } from "../components/CategoryFilter";
import { DealOfTheWeek } from "../components/DealOfTheWeek";
import { Footer } from "../components/Footer";
import { type Product } from "../components/ProductCard";
import { ProductCard } from "../components/ProductCard";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { SpecialPackagesSection } from "../components/SpecialPackagesSection";
import { AuthModal } from "../components/auth/AuthModal";
import { RegistryCartModal } from "../components/registry/RegistryCartModal";
import { RegistryCreateModal } from "../components/registry/RegistryCreateModal";
import { RegistryHeader } from "../components/registry/RegistryHeader";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
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
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { usePaginatedProducts } from "../hooks/usePaginatedProducts";
import {
  clearProductDetailReturnContext,
  getCurrentProductReturnPath,
  readProductDetailReturnContext,
} from "../../lib/productDetailReturn";
import { type SpecialPackage } from "../../lib/specialPackages";
import { type StoreLocationRecord } from "../../lib/storeLocations";

type AuthTab = "login" | "signup";

type RegistryLandingCacheEntry = {
  registries: RegistryRecord[];
};

const REGISTRY_LANDING_CACHE_STORAGE_PREFIX = "nbe:registry-landing:";
const registryLandingCache = new Map<string, RegistryLandingCacheEntry>();

function getRegistryLandingCacheKey(userId: string) {
  return `${REGISTRY_LANDING_CACHE_STORAGE_PREFIX}${userId}`;
}

function readRegistryLandingCache(userId: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const memoryEntry = registryLandingCache.get(userId);
  if (memoryEntry) {
    return memoryEntry;
  }

  try {
    const rawValue = window.sessionStorage.getItem(getRegistryLandingCacheKey(userId));
    if (!rawValue) {
      return undefined;
    }

    const parsed = JSON.parse(rawValue) as RegistryLandingCacheEntry;
    registryLandingCache.set(userId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function persistRegistryLandingCache(userId: string, entry: RegistryLandingCacheEntry) {
  registryLandingCache.set(userId, entry);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getRegistryLandingCacheKey(userId), JSON.stringify(entry));
  } catch {
    // Ignore storage failures and keep the in-memory cache.
  }
}

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

interface RegistryLandingPageProps {
  catalogOnly?: boolean;
  initialCategories?: string[];
  initialDeals?: HomepageDeal[];
  initialProducts?: StoreProduct[];
  initialSpecialPackages?: SpecialPackage[];
  initialStoreLocations?: StoreLocationRecord[];
  initialTotalCount?: number;
}

export function RegistryLandingPage({
  catalogOnly = false,
  initialCategories,
  initialDeals,
  initialProducts,
  initialSpecialPackages = [],
  initialStoreLocations = [],
  initialTotalCount,
}: RegistryLandingPageProps) {
  const router = useRouter();
  const { isAdmin, signOut, user } = useAuth();
  const userId = user?.id ?? null;
  const cachedRegistryLandingEntry = useMemo(
    () => (userId ? readRegistryLandingCache(userId) : undefined),
    [userId],
  );
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState<AuthTab>("signup");
  const [registryCartOpen, setRegistryCartOpen] = useState(false);
  const [registryCreateOpen, setRegistryCreateOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [registryCartItems, setRegistryCartItems] = useState<RegistryCartItem[]>([]);
  const [myRegistries, setMyRegistries] = useState<RegistryRecord[]>(
    cachedRegistryLandingEntry?.registries ?? [],
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const {
    loading: productsLoading,
    page,
    products,
    searchQuery,
    selectedCategory,
    setPage,
    setSearchQuery,
    setSelectedCategory,
    totalPages,
  } = usePaginatedProducts({
    onlyInStock: false,
    pageSize: 20,
    initialProducts,
    initialTotalCount,
  });

  const paginationItems = useMemo(
    () => buildPagination(page, totalPages),
    [page, totalPages],
  );

  const openAuth = (tab: AuthTab) => {
    setAuthDefaultTab(tab);
    setAuthModalOpen(true);
  };

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setRegistryCartItems(readRegistryCart());
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    const reopenContext = readProductDetailReturnContext();
    if (!reopenContext || reopenContext.originPath !== getCurrentProductReturnPath()) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setSelectedProduct(reopenContext.product);
      setProductDetailOpen(true);
      clearProductDetailReturnContext();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!userId || !hasSupabaseEnv) {
        if (!cancelled) {
          setMyRegistries([]);
        }
        return;
      }

      if (cachedRegistryLandingEntry) {
        if (!cancelled) {
          setMyRegistries(cachedRegistryLandingEntry.registries);
        }
        return;
      }

      const { data } = await supabase
        .from("registries")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!cancelled) {
        const nextRegistries = (data as RegistryRecord[] | null) ?? [];
        setMyRegistries(nextRegistries);
        persistRegistryLandingCache(userId, {
          registries: nextRegistries,
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [cachedRegistryLandingEntry, userId]);

  const activeRegistries = useMemo(() => {
    return myRegistries.filter((registry) => registry.status !== "closed");
  }, [myRegistries]);

  const latestRegistry = activeRegistries[0] ?? myRegistries[0] ?? null;
  const registryCartCount = registryCartItems.length;
  const giftBundles = initialSpecialPackages.filter(
    (entry) => entry.packageType === "gift_bundle",
  );
  const swoopPackages = initialSpecialPackages.filter(
    (entry) => entry.packageType === "swoop_package",
  );

  const handleAddToRegistry = (product: Product, quantity = 1) => {
    if (!user) {
      toast.info("Sign in to start building your registry.");
      openAuth("signup");
      return;
    }

    const nextItems = addRegistryCartItem(product, quantity);
    setRegistryCartItems(nextItems);
    toast.success(`${product.name} added to your registry cart.`);
  };

  const handleAddRegistryCartToExisting = async (registryId: string) => {
    if (!user) {
      openAuth("login");
      return;
    }

    if (!registryId) {
      toast.error("Select a registry first.");
      return;
    }

    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    const targetRegistry = activeRegistries.find((registry) => registry.id === registryId);
    if (!targetRegistry) {
      toast.error("This registry is no longer available for new items.");
      return;
    }

    const productIds = registryCartItems.map((item) => item.product.id);
    if (productIds.length === 0) {
      toast.info("Your registry cart is empty.");
      return;
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("registry_items")
      .select("id, product_id, requested_quantity")
      .eq("registry_id", registryId)
      .in("product_id", productIds);

    if (existingError) {
      toast.error("Could not load the existing registry items.");
      return;
    }

    const existingByProductId = new Map<number, { id: string; requested_quantity?: number | null }>(
      ((existingRows as Array<{ id: string; product_id: number; requested_quantity?: number | null }> | null) ?? [])
        .map((row) => [Number(row.product_id), row]),
    );

    for (const item of registryCartItems) {
      const existingItem = existingByProductId.get(item.product.id);

      if (existingItem) {
        const { error } = await supabase
          .from("registry_items")
          .update({
            requested_quantity: Number(existingItem.requested_quantity ?? 0) + item.quantity,
            unit_price_snapshot: item.product.price,
          })
          .eq("id", existingItem.id);

        if (error) {
          toast.error(`Could not update ${item.product.name} in your registry.`);
          return;
        }
      } else {
        const { error } = await supabase.from("registry_items").insert({
          registry_id: registryId,
          product_id: item.product.id,
          requested_quantity: item.quantity,
          purchased_quantity: 0,
          funded_amount: 0,
          unit_price_snapshot: item.product.price,
          note: "",
        });

        if (error) {
          toast.error(`Could not add ${item.product.name} to your registry.`);
          return;
        }
      }
    }

    clearRegistryCart();
    setRegistryCartItems([]);
    setRegistryCartOpen(false);
    toast.success("Registry items added successfully.");
    router.push(buildRegistryDashboardPath(targetRegistry));
  };

  const handleCreateNewRegistry = () => {
    if (!user) {
      openAuth("signup");
      return;
    }

    setRegistryCreateOpen(true);
  };

  const handleRemoveRegistryCartItem = (productId: number) => {
    setRegistryCartItems(removeRegistryCartItem(productId));
  };

  const handleUpdateRegistryCartItem = (productId: number, quantity: number) => {
    setRegistryCartItems(updateRegistryCartQuantity(productId, quantity));
  };

  const handleShareRegistry = async (registry: RegistryRecord) => {
    if (typeof window === "undefined") {
      return;
    }

    const shareUrl = `${window.location.origin}/registry/${registry.share_code}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: registry.name,
          text: "Check out my baby registry!",
          url: shareUrl,
        });
        return;
      } catch {
        // Fall back to clipboard below.
      }
    }

    await navigator.clipboard.writeText(shareUrl);
    toast.success("Registry link copied to clipboard.");
  };

  const handleOpenDashboard = () => {
    if (!user) {
      openAuth("login");
      return;
    }

    router.push("/dashboard");
  };

  const handleOpenAdmin = () => {
    if (!user) {
      openAuth("login");
      return;
    }

    if (!isAdmin) {
      toast.error("Admin access is not enabled for this account.");
      return;
    }

    router.push("/admin");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out.");
    router.push("/");
  };

  const handleViewProduct = (product: Product) => {
    setSelectedProduct(product);
    setProductDetailOpen(true);
  };

  return (
    <div className="min-h-screen bg-white">
      <RegistryHeader
        cartItemCount={registryCartCount}
        isAuthenticated={Boolean(user)}
        isAdmin={isAdmin}
        locations={initialStoreLocations}
        onCartClick={() => setRegistryCartOpen(true)}
        onOpenAdmin={handleOpenAdmin}
        onOpenDashboard={handleOpenDashboard}
        onSignIn={() => openAuth("login")}
        onSignOut={handleSignOut}
        onSignUp={() => openAuth("signup")}
      />

      <main>
        {!catalogOnly ? (
          <section className="bg-gradient-to-br from-pink-50 via-white to-blue-50 py-16 md:py-20">
            <div className="container mx-auto px-4">
              <div className="mx-auto max-w-4xl text-center">
                <h1 className="text-3xl font-bold leading-tight text-gray-900 md:text-5xl">
                  Create a Baby Registry That Loved Ones Can Shop From Anywhere
                </h1>
                <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-gray-600 md:mt-6 md:text-lg">
                  Start your registry, then add the baby products you really want and share one
                  simple public link.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Button
                    size="lg"
                    onClick={handleCreateNewRegistry}
                    className="px-6 text-[14px] md:px-8 md:text-lg"
                  >
                    <Gift className="mr-2 h-5 w-5" />
                    Create New Registry
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {!catalogOnly ? (
          <section className="bg-white py-14">
            <div className="container mx-auto px-4">
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-pink-200 bg-pink-50/70">
                  <CardContent className="p-6">
                    <h2 className="text-2xl font-bold text-gray-900">Registry Rewards</h2>
                    <p className="mt-3 text-gray-600">
                      Reach N500,000 in registry orders and receive lactation cookies.
                      Reach N1,000,000 and unlock 5% cashback on your registry.
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-blue-200 bg-blue-50/70">
                  <CardContent className="p-6">
                    <h2 className="text-2xl font-bold text-gray-900">Checklist Included</h2>
                    <p className="mt-3 text-gray-600">
                      Every registry gets a downloadable checklist on its detail page so
                      you can track essentials at a glance.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        ) : null}

        {!catalogOnly && user ? (
          <section className="bg-gray-50 py-14">
            <div className="container mx-auto px-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Your Registry Space</h2>
                  <p className="mt-2 text-gray-600">
                    Create a new registry any time, and open existing ones from their own page.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {latestRegistry ? (
                    <Button asChild variant="outline" className="w-full sm:w-auto">
                      <Link href="/dashboard/registries">
                        Open Existing Registry
                      </Link>
                    </Button>
                  ) : null}
                  <Button onClick={handleCreateNewRegistry} className="w-full sm:w-auto">
                    Create New Registry
                  </Button>
                </div>
              </div>

              {myRegistries.length > 0 ? (
                <div className="mt-8 grid gap-4 lg:grid-cols-2">
                  {myRegistries.map((registry) => (
                    <Card key={registry.id}>
                      <CardContent className="space-y-4 p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-pink-500">
                              {registry.status === "closed" ? "Closed Registry" : "Existing Registry"}
                            </p>
                            <h3 className="mt-2 text-2xl font-bold text-gray-900">
                              {registry.name}
                            </h3>
                          </div>
                          <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700">
                            {registry.share_code}
                          </span>
                        </div>

                        <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                          <p>Due Month: {formatDueMonth(registry.due_month)}</p>
                          <p>Baby Gender: {formatBabyGender(registry.baby_gender)}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                          <Button className="w-full sm:w-auto" asChild>
                            <Link href={buildRegistryDashboardPath(registry)}>
                              Open Existing Registry
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => handleShareRegistry(registry)}
                          >
                            <Share2 className="mr-2 h-4 w-4" />
                            Share Registry
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="mt-8">
                  <CardContent className="space-y-4 p-6 text-sm text-gray-600">
                    <p>
                      You do not have a registry yet. Create one first, then add products to your
                      registry cart from the catalog below.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleCreateNewRegistry}>Create New Registry</Button>
                      <Button
                        variant="outline"
                        onClick={() => toast.info("Your checklist will be available after you create a registry.")}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download Checklist
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
        ) : null}

        {!catalogOnly ? (
          <SpecialPackagesSection
            actionLabel="Add to Registry"
            giftBundles={giftBundles}
            onAction={(pkg, quantity = 1) => handleAddToRegistry(pkg.product, quantity)}
            swoopPackages={swoopPackages}
          />
        ) : null}

        {!catalogOnly ? (
          <DealOfTheWeek
            initialDeals={initialDeals}
            onAddToCart={(product) => handleAddToRegistry(product)}
            onViewDetails={handleViewProduct}
          />
        ) : null}

        <section className="bg-white py-20">
          <div className="container mx-auto px-4">
            <div className="mb-10 flex flex-col gap-4 text-center md:flex-row md:items-end md:justify-between md:text-left">
              <div>
                <h2 className="text-4xl font-bold text-gray-900">
                  {catalogOnly ? "Registry Product Catalog" : "Registry Products"}
                </h2>
                <p className="mt-3 text-gray-600">
                  Browse by category, add items to your registry cart, and save them once your
                  registry is ready.
                </p>
              </div>
            </div>

            <div className="mx-auto mb-8 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search for registry products..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="py-6 pl-10 text-lg"
                />
              </div>
            </div>

            <CategoryFilter
              categories={initialCategories?.length ? initialCategories : [...CATEGORIES]}
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
                      onViewDetails={handleViewProduct}
                    />
                  ))}
                </div>

                <Pagination className="mt-10">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href={catalogOnly ? "/registry/products" : "/registry"}
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
                            href={catalogOnly ? "/registry/products" : "/registry"}
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
                        href={catalogOnly ? "/registry/products" : "/registry"}
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
      </main>

      <ProductDetailModal
        product={selectedProduct}
        open={productDetailOpen}
        onClose={() => setProductDetailOpen(false)}
        onAddToCart={handleAddToRegistry}
        addActionLabel="Add to Registry"
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab={authDefaultTab}
      />

      <RegistryCartModal
        open={registryCartOpen}
        onOpenChange={setRegistryCartOpen}
        onClose={() => setRegistryCartOpen(false)}
        isAuthenticated={Boolean(user)}
        items={registryCartItems}
        registries={activeRegistries.map((registry) => ({
          id: registry.id,
          name: registry.name,
        }))}
        onRequireAuth={() => openAuth("signup")}
        onCreateNew={handleCreateNewRegistry}
        onAddToExisting={handleAddRegistryCartToExisting}
        onRemoveItem={handleRemoveRegistryCartItem}
        onUpdateQuantity={handleUpdateRegistryCartItem}
      />

      <RegistryCreateModal
        open={registryCreateOpen}
        onOpenChange={setRegistryCreateOpen}
        onCreated={(registry) => {
          void supabase
            .from("registries")
            .select("*")
            .eq("user_id", user?.id ?? "")
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              const nextRegistries = (data as RegistryRecord[] | null) ?? [];
              setMyRegistries(nextRegistries);
              if (user?.id) {
                persistRegistryLandingCache(user.id, {
                  registries: nextRegistries,
                });
              }
            });
          setRegistryCartItems(readRegistryCart());
          router.push(registry.dashboardPath);
        }}
      />

      <Footer />
    </div>
  );
}
