"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  DollarSign,
  Edit,
  ExternalLink,
  LayoutGrid,
  Package,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSlug,
  type BlogPostRecord,
  type CollectionRecord,
  type HomeDealRecord,
} from "../../lib/content";
import { formatNaira, formatNairaAmount, toNairaAmount } from "../../lib/commerce";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";

type AdminOrder = {
  id: string;
  created_at: string;
  total: number;
  status: string;
  shipping_address?: {
    name?: string;
  } | null;
};

type Customer = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at: string;
};

type ProductRecord = {
  id: number;
  name: string;
  price: number;
  category: string;
  image: string;
  description: string;
  in_stock: boolean;
  created_at?: string;
};

type RegistryRecord = {
  id: string;
  user_id: string;
  name: string;
  due_month?: string | null;
  baby_gender?: string | null;
  share_code: string;
  created_at: string;
};

type RegistryItemRow = {
  registry_id: string;
  requested_quantity?: number | null;
  purchased_quantity?: number | null;
};

type CollectionProductRow = {
  collection_id: string;
  product_id: number;
  sort_order: number;
};

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

function formatDate(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function AdminDashboard() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(Boolean(isAdmin && hasSupabaseEnv));
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [registries, setRegistries] = useState<RegistryRecord[]>([]);
  const [registrySummaries, setRegistrySummaries] = useState<
    Record<string, { requested: number; purchased: number }>
  >({});
  const [deals, setDeals] = useState<HomeDealRecord[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [collectionAssignments, setCollectionAssignments] = useState<
    CollectionProductRow[]
  >([]);
  const [blogPosts, setBlogPosts] = useState<BlogPostRecord[]>([]);

  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategory, setProductCategory] = useState("Toys");
  const [productImage, setProductImage] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productInStock, setProductInStock] = useState(true);
  const [productCollectionIds, setProductCollectionIds] = useState<string[]>([]);

  const [showDealModal, setShowDealModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<HomeDealRecord | null>(null);
  const [dealProductId, setDealProductId] = useState("");
  const [dealTitle, setDealTitle] = useState("");
  const [dealSubtitle, setDealSubtitle] = useState("");
  const [dealBadgeText, setDealBadgeText] = useState("");
  const [dealImage, setDealImage] = useState("");
  const [dealSalePrice, setDealSalePrice] = useState("");
  const [dealCompareAtPrice, setDealCompareAtPrice] = useState("");
  const [dealStartsAt, setDealStartsAt] = useState("");
  const [dealEndsAt, setDealEndsAt] = useState("");
  const [dealSortOrder, setDealSortOrder] = useState("0");
  const [dealIsActive, setDealIsActive] = useState(true);

  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionRecord | null>(
    null,
  );
  const [collectionName, setCollectionName] = useState("");
  const [collectionSlug, setCollectionSlug] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionHeroImage, setCollectionHeroImage] = useState("");
  const [collectionSortOrder, setCollectionSortOrder] = useState("0");
  const [collectionIsActive, setCollectionIsActive] = useState(true);

  const [showBlogModal, setShowBlogModal] = useState(false);
  const [editingBlog, setEditingBlog] = useState<BlogPostRecord | null>(null);
  const [blogTitle, setBlogTitle] = useState("");
  const [blogSlug, setBlogSlug] = useState("");
  const [blogCategory, setBlogCategory] = useState("Registry Tips");
  const [blogExcerpt, setBlogExcerpt] = useState("");
  const [blogCoverImage, setBlogCoverImage] = useState("");
  const [blogAuthorName, setBlogAuthorName] = useState("Nana's Editorial Team");
  const [blogBodyMarkdown, setBlogBodyMarkdown] = useState("");
  const [blogPublishedAt, setBlogPublishedAt] = useState("");
  const [blogIsPublished, setBlogIsPublished] = useState(true);

  const loadAdminData = useCallback(async () => {
    setLoading(true);

    const [
      ordersResult,
      customersResult,
      productsResult,
      registriesResult,
      registryItemsResult,
      dealsResult,
      collectionsResult,
      collectionAssignmentsResult,
      blogPostsResult,
    ] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("user_profiles").select("*").eq("is_admin", false),
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("registries").select("*").order("created_at", { ascending: false }),
      supabase.from("registry_items").select("registry_id, requested_quantity, purchased_quantity"),
      supabase
        .from("homepage_deals")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("collections")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("collection_products")
        .select("collection_id, product_id, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    setOrders(((ordersResult.error ? [] : ordersResult.data) ?? []) as AdminOrder[]);
    setCustomers(
      ((customersResult.error ? [] : customersResult.data) ?? []) as Customer[],
    );
    setProducts(
      ((productsResult.error ? [] : productsResult.data) ?? []) as ProductRecord[],
    );
    setRegistries(
      ((registriesResult.error ? [] : registriesResult.data) ?? []) as RegistryRecord[],
    );
    setDeals(((dealsResult.error ? [] : dealsResult.data) ?? []) as HomeDealRecord[]);
    setCollections(
      ((collectionsResult.error ? [] : collectionsResult.data) ?? []) as CollectionRecord[],
    );
    setCollectionAssignments(
      ((collectionAssignmentsResult.error
        ? []
        : collectionAssignmentsResult.data) ?? []) as CollectionProductRow[],
    );
    setBlogPosts(
      ((blogPostsResult.error ? [] : blogPostsResult.data) ?? []) as BlogPostRecord[],
    );

    const registrySummaryRows = ((registryItemsResult.error
      ? []
      : registryItemsResult.data) ?? []) as RegistryItemRow[];

    const registrySummaryMap = registrySummaryRows.reduce<Record<string, { requested: number; purchased: number }>>(
      (accumulator, row) => {
        const existing = accumulator[row.registry_id] ?? { requested: 0, purchased: 0 };
        existing.requested += Math.max(1, Number(row.requested_quantity ?? 1));
        existing.purchased += Math.max(0, Number(row.purchased_quantity ?? 0));
        accumulator[row.registry_id] = existing;
        return accumulator;
      },
      {},
    );
    setRegistrySummaries(registrySummaryMap);

    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin || !hasSupabaseEnv) {
      return;
    }

    queueMicrotask(() => {
      void loadAdminData();
    });
  }, [isAdmin, loadAdminData]);

  const customerLookup = useMemo(() => {
    return Object.fromEntries(customers.map((customer) => [customer.id, customer])) as Record<
      string,
      Customer
    >;
  }, [customers]);

  const productLookup = useMemo(() => {
    return Object.fromEntries(products.map((product) => [product.id, product])) as Record<
      number,
      ProductRecord
    >;
  }, [products]);

  const collectionLookup = useMemo(() => {
    return Object.fromEntries(
      collections.map((collection) => [collection.id, collection]),
    ) as Record<string, CollectionRecord>;
  }, [collections]);

  const productCollections = useMemo(() => {
    return collectionAssignments.reduce<Record<number, string[]>>((accumulator, row) => {
      const existing = accumulator[row.product_id] ?? [];
      existing.push(row.collection_id);
      accumulator[row.product_id] = existing;
      return accumulator;
    }, {});
  }, [collectionAssignments]);

  const collectionCounts = useMemo(() => {
    return collectionAssignments.reduce<Record<string, number>>((accumulator, row) => {
      accumulator[row.collection_id] = (accumulator[row.collection_id] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [collectionAssignments]);

  const stats = useMemo(() => {
    const paidOrders = orders.filter((order) => order.status === "paid");

    return {
      totalOrders: orders.length,
      totalRevenue: paidOrders.reduce((sum, order) => sum + Number(order.total), 0),
      totalCustomers: customers.length,
      totalProducts: products.length,
    };
  }, [customers.length, orders, products.length]);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyOrders = orders.filter((order) => {
    const orderDate = new Date(order.created_at);
    return (
      orderDate.getMonth() === currentMonth &&
      orderDate.getFullYear() === currentYear
    );
  });
  const monthlyRevenue = monthlyOrders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + Number(order.total), 0);

  const toggleProductCollection = (collectionId: string) => {
    setProductCollectionIds((current) =>
      current.includes(collectionId)
        ? current.filter((value) => value !== collectionId)
        : [...current, collectionId],
    );
  };

  const resetProductForm = () => {
    setEditingProduct(null);
    setProductName("");
    setProductPrice("");
    setProductCategory("Toys");
    setProductImage("");
    setProductDescription("");
    setProductInStock(true);
    setProductCollectionIds([]);
  };

  const handleEditProduct = (product: ProductRecord) => {
    setEditingProduct(product);
    setProductName(product.name);
    setProductPrice(String(toNairaAmount(Number(product.price))));
    setProductCategory(product.category);
    setProductImage(product.image);
    setProductDescription(product.description);
    setProductInStock(Boolean(product.in_stock));
    setProductCollectionIds(productCollections[product.id] ?? []);
    setShowProductModal(true);
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();

    const productPayload = {
      name: productName,
      price: Number(productPrice) / 1000,
      category: productCategory,
      image: productImage,
      description: productDescription,
      in_stock: productInStock,
    };

    const { data: savedProduct, error } = editingProduct
      ? await supabase
          .from("products")
          .update(productPayload)
          .eq("id", editingProduct.id)
          .select("*")
          .single()
      : await supabase.from("products").insert(productPayload).select("*").single();

    if (error || !savedProduct) {
      toast.error("Failed to save product.");
      return;
    }

    const productId = Number((savedProduct as ProductRecord).id);

    await supabase.from("collection_products").delete().eq("product_id", productId);

    if (productCollectionIds.length > 0) {
      const { error: collectionLinkError } = await supabase
        .from("collection_products")
        .insert(
          productCollectionIds.map((collectionId, index) => ({
            collection_id: collectionId,
            product_id: productId,
            sort_order: index,
          })),
        );

      if (collectionLinkError) {
        toast.error("Product saved, but collection assignment failed.");
      }
    }

    toast.success(editingProduct ? "Product updated." : "Product created.");
    setShowProductModal(false);
    resetProductForm();
    void loadAdminData();
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!window.confirm("Delete this product?")) {
      return;
    }

    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) {
      toast.error("Failed to delete product.");
      return;
    }

    toast.success("Product deleted.");
    void loadAdminData();
  };

  const resetDealForm = () => {
    setEditingDeal(null);
    setDealProductId(products[0] ? String(products[0].id) : "");
    setDealTitle("");
    setDealSubtitle("");
    setDealBadgeText("");
    setDealImage("");
    setDealSalePrice("");
    setDealCompareAtPrice("");
    setDealStartsAt("");
    setDealEndsAt("");
    setDealSortOrder("0");
    setDealIsActive(true);
  };

  const handleEditDeal = (deal: HomeDealRecord) => {
    setEditingDeal(deal);
    setDealProductId(String(deal.product_id));
    setDealTitle(deal.title);
    setDealSubtitle(deal.subtitle ?? "");
    setDealBadgeText(deal.badge_text ?? "");
    setDealImage(deal.override_image ?? "");
    setDealSalePrice(String(toNairaAmount(Number(deal.sale_price))));
    setDealCompareAtPrice(
      deal.compare_at_price ? String(toNairaAmount(Number(deal.compare_at_price))) : "",
    );
    setDealStartsAt(toDatetimeLocalValue(deal.starts_at));
    setDealEndsAt(toDatetimeLocalValue(deal.ends_at));
    setDealSortOrder(String(deal.sort_order ?? 0));
    setDealIsActive(Boolean(deal.is_active));
    setShowDealModal(true);
  };

  const handleSaveDeal = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      product_id: Number(dealProductId),
      title: dealTitle,
      subtitle: dealSubtitle || null,
      badge_text: dealBadgeText || null,
      override_image: dealImage || null,
      sale_price: Number(dealSalePrice) / 1000,
      compare_at_price: dealCompareAtPrice ? Number(dealCompareAtPrice) / 1000 : null,
      starts_at: dealStartsAt ? new Date(dealStartsAt).toISOString() : null,
      ends_at: dealEndsAt ? new Date(dealEndsAt).toISOString() : null,
      is_active: dealIsActive,
      sort_order: Number(dealSortOrder || 0),
    };

    const { error } = editingDeal
      ? await supabase.from("homepage_deals").update(payload).eq("id", editingDeal.id)
      : await supabase.from("homepage_deals").insert(payload);

    if (error) {
      toast.error("Failed to save deal.");
      return;
    }

    toast.success(editingDeal ? "Deal updated." : "Deal created.");
    setShowDealModal(false);
    resetDealForm();
    void loadAdminData();
  };

  const handleDeleteDeal = async (dealId: string) => {
    if (!window.confirm("Delete this deal?")) {
      return;
    }

    const { error } = await supabase.from("homepage_deals").delete().eq("id", dealId);
    if (error) {
      toast.error("Failed to delete deal.");
      return;
    }

    toast.success("Deal deleted.");
    void loadAdminData();
  };

  const resetCollectionForm = () => {
    setEditingCollection(null);
    setCollectionName("");
    setCollectionSlug("");
    setCollectionDescription("");
    setCollectionHeroImage("");
    setCollectionSortOrder("0");
    setCollectionIsActive(true);
  };

  const handleEditCollection = (collection: CollectionRecord) => {
    setEditingCollection(collection);
    setCollectionName(collection.name);
    setCollectionSlug(collection.slug);
    setCollectionDescription(collection.description ?? "");
    setCollectionHeroImage(collection.hero_image ?? "");
    setCollectionSortOrder(String(collection.sort_order ?? 0));
    setCollectionIsActive(Boolean(collection.is_active));
    setShowCollectionModal(true);
  };

  const handleSaveCollection = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      name: collectionName,
      slug: collectionSlug || createSlug(collectionName),
      description: collectionDescription || null,
      hero_image: collectionHeroImage || null,
      is_active: collectionIsActive,
      sort_order: Number(collectionSortOrder || 0),
    };

    const { error } = editingCollection
      ? await supabase.from("collections").update(payload).eq("id", editingCollection.id)
      : await supabase.from("collections").insert(payload);

    if (error) {
      toast.error("Failed to save collection.");
      return;
    }

    toast.success(editingCollection ? "Collection updated." : "Collection created.");
    setShowCollectionModal(false);
    resetCollectionForm();
    void loadAdminData();
  };

  const handleDeleteCollection = async (collectionId: string) => {
    if (!window.confirm("Delete this collection?")) {
      return;
    }

    const { error } = await supabase.from("collections").delete().eq("id", collectionId);
    if (error) {
      toast.error("Failed to delete collection.");
      return;
    }

    toast.success("Collection deleted.");
    void loadAdminData();
  };

  const resetBlogForm = () => {
    setEditingBlog(null);
    setBlogTitle("");
    setBlogSlug("");
    setBlogCategory("Registry Tips");
    setBlogExcerpt("");
    setBlogCoverImage("");
    setBlogAuthorName("Nana's Editorial Team");
    setBlogBodyMarkdown("");
    setBlogPublishedAt("");
    setBlogIsPublished(true);
  };

  const handleEditBlog = (blog: BlogPostRecord) => {
    setEditingBlog(blog);
    setBlogTitle(blog.title);
    setBlogSlug(blog.slug);
    setBlogCategory(blog.category);
    setBlogExcerpt(blog.excerpt);
    setBlogCoverImage(blog.cover_image ?? "");
    setBlogAuthorName(blog.author_name);
    setBlogBodyMarkdown(blog.body_markdown);
    setBlogPublishedAt(toDatetimeLocalValue(blog.published_at));
    setBlogIsPublished(Boolean(blog.is_published));
    setShowBlogModal(true);
  };

  const handleSaveBlog = async (event: React.FormEvent) => {
    event.preventDefault();

    const publishedAt =
      blogIsPublished && blogPublishedAt
        ? new Date(blogPublishedAt).toISOString()
        : blogIsPublished
          ? new Date().toISOString()
          : null;

    const payload = {
      title: blogTitle,
      slug: blogSlug || createSlug(blogTitle),
      category: blogCategory,
      excerpt: blogExcerpt,
      cover_image: blogCoverImage || null,
      body_markdown: blogBodyMarkdown,
      author_name: blogAuthorName,
      is_published: blogIsPublished,
      published_at: publishedAt,
    };

    const { error } = editingBlog
      ? await supabase.from("blog_posts").update(payload).eq("id", editingBlog.id)
      : await supabase.from("blog_posts").insert(payload);

    if (error) {
      toast.error("Failed to save blog post.");
      return;
    }

    toast.success(editingBlog ? "Blog post updated." : "Blog post created.");
    setShowBlogModal(false);
    resetBlogForm();
    void loadAdminData();
  };

  const handleDeleteBlog = async (blogId: string) => {
    if (!window.confirm("Delete this blog post?")) {
      return;
    }

    const { error } = await supabase.from("blog_posts").delete().eq("id", blogId);
    if (error) {
      toast.error("Failed to delete blog post.");
      return;
    }

    toast.success("Blog post deleted.");
    void loadAdminData();
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Access denied. Admin only.</p>
      </div>
    );
  }

  if (!hasSupabaseEnv) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">
          Connect Supabase to enable the admin dashboard.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
            <p className="text-xs text-gray-500">{monthlyOrders.length} this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNairaAmount(stats.totalRevenue)}
            </div>
            <p className="text-xs text-gray-500">
              {formatNairaAmount(monthlyRevenue)} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
            <p className="text-xs text-gray-500">Registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Products</CardTitle>
            <ShoppingBag className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-gray-500">
              {products.filter((product) => product.in_stock).length} in stock
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="orders" className="space-y-6">
        <TabsList className="flex h-auto flex-wrap justify-start gap-2">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="registries">Registries</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="blogs">Blogs</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm">
                        {order.id.substring(0, 8)}
                      </TableCell>
                      <TableCell>{order.shipping_address?.name ?? "N/A"}</TableCell>
                      <TableCell>{formatDate(order.created_at)}</TableCell>
                      <TableCell>{formatNairaAmount(Number(order.total))}</TableCell>
                      <TableCell>{order.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registries">
          <Card>
            <CardHeader>
              <CardTitle>Baby Registries</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Registry Name</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Due Month</TableHead>
                    <TableHead>Needed / Gifted</TableHead>
                    <TableHead>Share Code</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registries.map((registry) => {
                    const owner = customerLookup[registry.user_id];
                    const summary = registrySummaries[registry.id] ?? {
                      requested: 0,
                      purchased: 0,
                    };

                    return (
                      <TableRow key={registry.id}>
                        <TableCell className="font-medium">{registry.name}</TableCell>
                        <TableCell>{owner?.full_name || owner?.email || "N/A"}</TableCell>
                        <TableCell>
                          {formatDueMonth(registry.due_month)} /{" "}
                          {formatBabyGender(registry.baby_gender)}
                        </TableCell>
                        <TableCell>
                          {summary.requested} / {summary.purchased}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {registry.share_code}
                        </TableCell>
                        <TableCell>{formatDate(registry.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle>Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>{customer.full_name ?? "N/A"}</TableCell>
                      <TableCell>{customer.email ?? "N/A"}</TableCell>
                      <TableCell>{customer.phone ?? "N/A"}</TableCell>
                      <TableCell>{formatDate(customer.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Products</CardTitle>
              <Button
                onClick={() => {
                  resetProductForm();
                  setShowProductModal(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Collections</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>
                        {(productCollections[product.id] ?? [])
                          .map((collectionId) => collectionLookup[collectionId]?.name)
                          .filter(Boolean)
                          .join(", ") || "None"}
                      </TableCell>
                      <TableCell>{formatNaira(Number(product.price))}</TableCell>
                      <TableCell>
                        <span className={product.in_stock ? "text-green-600" : "text-red-600"}>
                          {product.in_stock ? "In Stock" : "Out of Stock"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditProduct(product)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteProduct(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deals">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Homepage Deals</CardTitle>
              <Button
                onClick={() => {
                  resetDealForm();
                  setShowDealModal(true);
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Add Deal
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Pricing</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell>
                        <div className="font-medium">{deal.title}</div>
                        <div className="text-xs text-gray-500">
                          {deal.badge_text || "No badge"}
                        </div>
                      </TableCell>
                      <TableCell>{productLookup[deal.product_id]?.name ?? "N/A"}</TableCell>
                      <TableCell>
                        {formatNaira(Number(deal.sale_price))}
                        {deal.compare_at_price ? (
                          <span className="ml-2 text-xs text-gray-500 line-through">
                            {formatNaira(Number(deal.compare_at_price))}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {formatDate(deal.starts_at)} to {formatDate(deal.ends_at)}
                      </TableCell>
                      <TableCell>{deal.is_active ? "Active" : "Inactive"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditDeal(deal)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteDeal(deal.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collections">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Collections</CardTitle>
              <Button
                onClick={() => {
                  resetCollectionForm();
                  setShowCollectionModal(true);
                }}
              >
                <LayoutGrid className="mr-2 h-4 w-4" />
                Add Collection
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Assigned Products</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.map((collection) => (
                    <TableRow key={collection.id}>
                      <TableCell>
                        <div className="font-medium">{collection.name}</div>
                        <div className="text-xs text-gray-500">
                          {collection.description || "No description"}
                        </div>
                      </TableCell>
                      <TableCell>{collection.slug}</TableCell>
                      <TableCell>{collectionCounts[collection.id] ?? 0}</TableCell>
                      <TableCell>{collection.is_active ? "Active" : "Inactive"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCollection(collection)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteCollection(collection.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blogs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Blog Posts</CardTitle>
              <Button
                onClick={() => {
                  resetBlogForm();
                  setShowBlogModal(true);
                }}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Write Blog Post
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blogPosts.map((post) => (
                    <TableRow key={post.id}>
                      <TableCell>
                        <div className="font-medium">{post.title}</div>
                        <div className="text-xs text-gray-500">{post.slug}</div>
                      </TableCell>
                      <TableCell>{post.category}</TableCell>
                      <TableCell>{post.author_name}</TableCell>
                      <TableCell>{post.is_published ? "Published" : "Draft"}</TableCell>
                      <TableCell>{formatDate(post.published_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditBlog(post)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {post.is_published ? (
                            <Button asChild variant="outline" size="sm">
                              <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          ) : null}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteBlog(post.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveProduct} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product-name">Product Name</Label>
              <Input
                id="product-name"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-price">Price (NGN)</Label>
                <Input
                  id="product-price"
                  type="number"
                  min="0"
                  value={productPrice}
                  onChange={(event) => setProductPrice(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-category">Category</Label>
                <Select value={productCategory} onValueChange={setProductCategory}>
                  <SelectTrigger id="product-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Toys">Toys</SelectItem>
                    <SelectItem value="Clothing">Clothing</SelectItem>
                    <SelectItem value="Accessories">Accessories</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-image">Image URL</Label>
              <Input
                id="product-image"
                value={productImage}
                onChange={(event) => setProductImage(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-description">Description</Label>
              <Textarea
                id="product-description"
                value={productDescription}
                onChange={(event) => setProductDescription(event.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Collections</Label>
              <div className="grid gap-2 rounded-lg border p-4 md:grid-cols-2">
                {collections.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Create a collection first, then assign this product to it.
                  </p>
                ) : (
                  collections.map((collection) => (
                    <label
                      key={collection.id}
                      className="flex items-center gap-2 text-sm text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={productCollectionIds.includes(collection.id)}
                        onChange={() => toggleProductCollection(collection.id)}
                      />
                      {collection.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={productInStock}
                onChange={(event) => setProductInStock(event.target.checked)}
              />
              In stock
            </label>

            <Button type="submit" className="w-full">
              {editingProduct ? "Update Product" : "Create Product"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDealModal} onOpenChange={setShowDealModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingDeal ? "Edit Deal" : "Add Deal"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveDeal} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deal-product">Linked Product</Label>
              <Select value={dealProductId} onValueChange={setDealProductId}>
                <SelectTrigger id="deal-product">
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={String(product.id)}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deal-title">Deal Title</Label>
                <Input
                  id="deal-title"
                  value={dealTitle}
                  onChange={(event) => setDealTitle(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-badge">Badge Text</Label>
                <Input
                  id="deal-badge"
                  value={dealBadgeText}
                  onChange={(event) => setDealBadgeText(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deal-subtitle">Subtitle</Label>
              <Textarea
                id="deal-subtitle"
                value={dealSubtitle}
                onChange={(event) => setDealSubtitle(event.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deal-sale-price">Sale Price (NGN)</Label>
                <Input
                  id="deal-sale-price"
                  type="number"
                  min="0"
                  value={dealSalePrice}
                  onChange={(event) => setDealSalePrice(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-compare-price">Compare At Price (NGN)</Label>
                <Input
                  id="deal-compare-price"
                  type="number"
                  min="0"
                  value={dealCompareAtPrice}
                  onChange={(event) => setDealCompareAtPrice(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deal-image">Override Image URL</Label>
              <Input
                id="deal-image"
                value={dealImage}
                onChange={(event) => setDealImage(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="deal-starts">Starts At</Label>
                <Input
                  id="deal-starts"
                  type="datetime-local"
                  value={dealStartsAt}
                  onChange={(event) => setDealStartsAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-ends">Ends At</Label>
                <Input
                  id="deal-ends"
                  type="datetime-local"
                  value={dealEndsAt}
                  onChange={(event) => setDealEndsAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-sort-order">Sort Order</Label>
                <Input
                  id="deal-sort-order"
                  type="number"
                  value={dealSortOrder}
                  onChange={(event) => setDealSortOrder(event.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={dealIsActive}
                onChange={(event) => setDealIsActive(event.target.checked)}
              />
              Deal is active
            </label>

            <Button type="submit" className="w-full">
              {editingDeal ? "Update Deal" : "Create Deal"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCollectionModal} onOpenChange={setShowCollectionModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCollection ? "Edit Collection" : "Add Collection"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveCollection} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="collection-name">Collection Name</Label>
              <Input
                id="collection-name"
                value={collectionName}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setCollectionName(nextName);
                  if (!editingCollection) {
                    setCollectionSlug(createSlug(nextName));
                  }
                }}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="collection-slug">Slug</Label>
              <Input
                id="collection-slug"
                value={collectionSlug}
                onChange={(event) => setCollectionSlug(createSlug(event.target.value))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="collection-description">Description</Label>
              <Textarea
                id="collection-description"
                value={collectionDescription}
                onChange={(event) => setCollectionDescription(event.target.value)}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="collection-image">Hero Image URL</Label>
                <Input
                  id="collection-image"
                  value={collectionHeroImage}
                  onChange={(event) => setCollectionHeroImage(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collection-sort-order">Sort Order</Label>
                <Input
                  id="collection-sort-order"
                  type="number"
                  value={collectionSortOrder}
                  onChange={(event) => setCollectionSortOrder(event.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={collectionIsActive}
                onChange={(event) => setCollectionIsActive(event.target.checked)}
              />
              Collection is active
            </label>

            <Button type="submit" className="w-full">
              {editingCollection ? "Update Collection" : "Create Collection"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showBlogModal} onOpenChange={setShowBlogModal}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBlog ? "Edit Blog Post" : "Write Blog Post"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveBlog} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="blog-title">Title</Label>
                <Input
                  id="blog-title"
                  value={blogTitle}
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    setBlogTitle(nextTitle);
                    if (!editingBlog) {
                      setBlogSlug(createSlug(nextTitle));
                    }
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-category">Category</Label>
                <Input
                  id="blog-category"
                  value={blogCategory}
                  onChange={(event) => setBlogCategory(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="blog-slug">Slug</Label>
                <Input
                  id="blog-slug"
                  value={blogSlug}
                  onChange={(event) => setBlogSlug(createSlug(event.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-author">Author Name</Label>
                <Input
                  id="blog-author"
                  value={blogAuthorName}
                  onChange={(event) => setBlogAuthorName(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="blog-excerpt">Excerpt</Label>
              <Textarea
                id="blog-excerpt"
                value={blogExcerpt}
                onChange={(event) => setBlogExcerpt(event.target.value)}
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="blog-cover-image">Cover Image URL</Label>
              <Input
                id="blog-cover-image"
                value={blogCoverImage}
                onChange={(event) => setBlogCoverImage(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="blog-body">Body (Markdown)</Label>
              <Textarea
                id="blog-body"
                value={blogBodyMarkdown}
                onChange={(event) => setBlogBodyMarkdown(event.target.value)}
                rows={14}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="blog-published-at">Publish Date</Label>
                <Input
                  id="blog-published-at"
                  type="datetime-local"
                  value={blogPublishedAt}
                  onChange={(event) => setBlogPublishedAt(event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 self-end text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={blogIsPublished}
                  onChange={(event) => setBlogIsPublished(event.target.checked)}
                />
                Publish immediately
              </label>
            </div>

            <Button type="submit" className="w-full">
              {editingBlog ? "Update Blog Post" : "Create Blog Post"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
