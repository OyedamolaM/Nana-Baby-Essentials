"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  Edit,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatNaira,
  formatNairaAmount,
  toNairaAmount,
} from "../../lib/commerce";
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

export function AdminDashboard() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(Boolean(isAdmin && hasSupabaseEnv));
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);

  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategory, setProductCategory] = useState("Toys");
  const [productImage, setProductImage] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productInStock, setProductInStock] = useState(true);

  const loadAdminData = useCallback(async () => {
    setLoading(true);

    const [{ data: ordersData }, { data: customersData }, { data: productsData }] =
      await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("user_profiles").select("*"),

        supabase
          .from("products")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      const test = await supabase.from("user_profiles").select("count");
      console.log("Total rows in profiles table:", test.count);


    setOrders((ordersData as AdminOrder[] | null) ?? []);
    setCustomers((customersData as Customer[] | null) ?? []);
    setProducts((productsData as ProductRecord[] | null) ?? []);
    setLoading(false);

    console.log("Customers from DB:", customersData);
  }, []);

  useEffect(() => {
    if (!isAdmin || !hasSupabaseEnv) {
      return;
    }

    queueMicrotask(() => {
      void loadAdminData();
    });
  }, [isAdmin, loadAdminData]);

  const stats = useMemo(() => {
  const totalRevenue = orders
  .filter(o => o.status === "paid")
  .reduce((sum, order) => sum + Number(order.total), 0);

  const paidOrders = orders.filter(order => order.status === "paid");
  
  return {
    totalOrders: paidOrders.length,
    totalRevenue: totalRevenue,
    totalCustomers: customers.length,
    totalProducts: products.length,
  };
}, [customers.length, orders, products.length]);

const paidOrdersList = orders.filter(o => o.status === "paid");
const unfinishedOrdersList = orders.filter(o => o.status !== "paid");


  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();

    const productData = {
      name: productName,
      price: Number(productPrice) / 1000,
      category: productCategory,
      image: productImage,
      description: productDescription,
      in_stock: productInStock,
    };

    if (editingProduct) {
      const { error } = await supabase
        .from("products")
        .update(productData)
        .eq("id", editingProduct.id);

      if (error) {
        toast.error("Failed to update product.");
        return;
      }

      toast.success("Product updated successfully.");
    } else {
      const { error } = await supabase.from("products").insert(productData);

      if (error) {
        toast.error("Failed to create product.");
        return;
      }

      toast.success("Product created successfully.");
    }

    setShowProductModal(false);
    resetProductForm();
    void loadAdminData();
  };

  const handleEditProduct = (product: ProductRecord) => {
    setEditingProduct(product);
    setProductName(product.name);
    setProductPrice(String(toNairaAmount(Number(product.price))));
    setProductCategory(product.category);
    setProductImage(product.image);
    setProductDescription(product.description);
    setProductInStock(Boolean(product.in_stock));
    setShowProductModal(true);
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!window.confirm("Are you sure you want to delete this product?")) {
      return;
    }

    const { error } = await supabase.from("products").delete().eq("id", productId);

    if (error) {
      toast.error("Failed to delete product.");
    } else {
      toast.success("Product deleted.");
      void loadAdminData();
    }
  };

  const resetProductForm = () => {
    setEditingProduct(null);
    setProductName("");
    setProductPrice("");
    setProductCategory("Toys");
    setProductImage("");
    setProductDescription("");
    setProductInStock(true);
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
          Connect Supabase to enable product, customer, and order management.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyOrders = orders.filter((order) => {
    const orderDate = new Date(order.created_at);
    return (
      order.status === "paid" &&
      orderDate.getMonth() === currentMonth &&
      orderDate.getFullYear() === currentYear
    );
  });

  const monthlyRevenue = monthlyOrders.reduce(
    (sum, order) => sum + Number(order.total),
    0,
  );

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
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Order Management</CardTitle>
            </CardHeader>
            <CardContent>

              <Tabs defaultValue="paid_only">
                <TabsList className="mb-4 grid w-[400px] grid-cols-2">
                  <TabsTrigger value="paid_only" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
                    Paid Orders ({paidOrdersList.length})
                  </TabsTrigger>
                  <TabsTrigger value="unfinished_only" className="data-[state=active]:bg-yellow-600 data-[state=active]:text-white">
                    Unfinished ({unfinishedOrdersList.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="paid_only">
                  <div className="rounded-md border border-green-200">
                    <OrderTable data={paidOrdersList} />
                  </div>
                </TabsContent>

                {/* Tab 2: Only Unfinished Orders */}
                <TabsContent value="unfinished_only">
                  <div className="rounded-md border border-yellow-200">
                    <OrderTable data={unfinishedOrdersList} />
                  </div>
                </TabsContent>
              </Tabs>
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
                      <TableCell>
                        {new Date(customer.created_at).toLocaleDateString()}
                      </TableCell>
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
      </Tabs>

      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add New Product"}
            </DialogTitle>
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

            <div className="grid grid-cols-2 gap-4">
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
                  <SelectTrigger>
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
              <Input
                id="product-description"
                value={productDescription}
                onChange={(event) => setProductDescription(event.target.value)}
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="product-in-stock"
                checked={productInStock}
                onChange={(event) => setProductInStock(event.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="product-in-stock">In Stock</Label>
            </div>

            <Button type="submit" className="w-full">
              {editingProduct ? "Update Product" : "Create Product"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderTable({ data }: { data: AdminOrder[] }) {
  return (
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
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-8 text-center text-gray-500">
              No orders found in this category.
            </TableCell>
          </TableRow>
        ) : (
          data.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-xs">#{order.id.substring(0, 8)}</TableCell>
              <TableCell>{order.shipping_address?.name ?? "N/A"}</TableCell>
              <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
              <TableCell>{formatNairaAmount(Number(order.total))}</TableCell>
              <TableCell>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                  order.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                }`}>
                  {order.status}
                </span>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
