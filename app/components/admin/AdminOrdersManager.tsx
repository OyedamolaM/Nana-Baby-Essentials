"use client";

import { useMemo, useState } from "react";
import { Edit, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  formatNairaAmount,
  getProductSellingPrice,
  toNairaAmount,
  type ProductRecord,
} from "../../../lib/commerce";
import {
  normalizeShippingAddress,
  type ShippingAddress,
} from "../../../lib/userProfile";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

type AdminOrderItem = {
  name?: string;
  price?: number;
  product_id?: number | null;
  quantity?: number;
};

export type AdminOrderRecord = {
  created_at: string;
  customer_email?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  id: string;
  items?: AdminOrderItem[] | null;
  payment_reference?: string | null;
  shipping_address?: Partial<ShippingAddress> | null;
  shipping_tier?: string | null;
  status: string;
  total: number;
  user_id?: string | null;
};

type CustomerRecord = {
  email?: string | null;
  full_name?: string | null;
  id: string;
  phone?: string | null;
  shipping_address?: Partial<ShippingAddress> | null;
};

type ShippingTierRecord = {
  code: string;
  fee: number;
  is_active: boolean;
  label: string;
};

type DraftOrderItem = {
  amount: string;
  clientId: string;
  name: string;
  productId: string;
  quantity: string;
};

const ORDER_STATUS_OPTIONS = [
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Awaiting Payment", value: "awaiting_payment" },
  { label: "Cancelled", value: "cancelled" },
] as const;

function createDraftId() {
  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyDraftItem(): DraftOrderItem {
  return {
    amount: "",
    clientId: createDraftId(),
    name: "",
    productId: "",
    quantity: "1",
  };
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminOrdersManager({
  customers,
  getAdminAccessToken,
  onReload,
  orders,
  products,
  shippingTiers,
}: {
  customers: CustomerRecord[];
  getAdminAccessToken: () => Promise<string | null>;
  onReload: () => Promise<void>;
  orders: AdminOrderRecord[];
  products: ProductRecord[];
  shippingTiers: ShippingTierRecord[];
}) {
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<AdminOrderRecord | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("__manual__");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingTier, setShippingTier] = useState("");
  const [orderStatus, setOrderStatus] = useState("paid");
  const [paymentReference, setPaymentReference] = useState("");
  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>([createEmptyDraftItem()]);

  const activeShippingTiers = useMemo(() => {
    return shippingTiers.filter((tier) => tier.is_active);
  }, [shippingTiers]);

  const customerLookup = useMemo(() => {
    return Object.fromEntries(customers.map((customer) => [customer.id, customer])) as Record<
      string,
      CustomerRecord
    >;
  }, [customers]);

  const productLookup = useMemo(() => {
    return Object.fromEntries(products.map((product) => [String(product.id), product])) as Record<
      string,
      ProductRecord
    >;
  }, [products]);

  const normalizedItems = useMemo(() => {
    return draftItems
      .map((item) => ({
        name: item.name.trim(),
        price: Math.max(0, Math.round(Number(item.amount || 0))),
        productId: item.productId ? Number(item.productId) : null,
        quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
      }))
      .filter((item) => item.name && item.price > 0);
  }, [draftItems]);

  const totalAmount = useMemo(() => {
    return normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [normalizedItems]);
  const paidOrders = useMemo(() => {
    return orders.filter((order) => order.status === "paid");
  }, [orders]);
  const unpaidOrders = useMemo(() => {
    return orders.filter((order) => order.status !== "paid");
  }, [orders]);

  const applyCustomerSnapshot = (customerId: string) => {
    setSelectedCustomerId(customerId);

    if (customerId === "__manual__") {
      return;
    }

    const customer = customerLookup[customerId];
    if (!customer) {
      return;
    }

    const savedAddress = normalizeShippingAddress(customer.shipping_address);
    setCustomerName(customer.full_name ?? "");
    setCustomerEmail(customer.email ?? "");
    setCustomerPhone(customer.phone ?? savedAddress.phone);
    setShippingName(savedAddress.name || customer.full_name || "");
    setShippingPhone(savedAddress.phone || customer.phone || "");
    setShippingAddress(savedAddress.address);
    setShippingCity(savedAddress.city);
    setShippingState(savedAddress.state);
  };

  const resetOrderForm = () => {
    setEditingOrder(null);
    setSelectedCustomerId("__manual__");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setShippingTier(activeShippingTiers[0]?.code ?? shippingTiers[0]?.code ?? "");
    setOrderStatus("paid");
    setPaymentReference("");
    setShippingName("");
    setShippingPhone("");
    setShippingAddress("");
    setShippingCity("");
    setShippingState("");
    setDraftItems([createEmptyDraftItem()]);
  };

  const handleEditOrder = (order: AdminOrderRecord) => {
    const savedAddress = normalizeShippingAddress(order.shipping_address);
    setEditingOrder(order);
    setSelectedCustomerId(
      order.user_id && customerLookup[order.user_id] ? order.user_id : "__manual__",
    );
    setCustomerName(order.customer_name ?? savedAddress.name);
    setCustomerEmail(order.customer_email ?? "");
    setCustomerPhone(order.customer_phone ?? savedAddress.phone);
    setShippingTier(order.shipping_tier ?? activeShippingTiers[0]?.code ?? "");
    setOrderStatus(order.status);
    setPaymentReference(order.payment_reference ?? "");
    setShippingName(savedAddress.name || order.customer_name || "");
    setShippingPhone(savedAddress.phone || order.customer_phone || "");
    setShippingAddress(savedAddress.address);
    setShippingCity(savedAddress.city);
    setShippingState(savedAddress.state);
    setDraftItems(
      (order.items ?? []).length > 0
        ? (order.items ?? []).map((item) => ({
            amount: String(Math.max(0, Math.round(Number(item.price ?? 0)))),
            clientId: createDraftId(),
            name: item.name ?? "",
            productId: item.product_id ? String(item.product_id) : "",
            quantity: String(Math.max(1, Math.floor(Number(item.quantity ?? 1)))),
          }))
        : [createEmptyDraftItem()],
    );
    setShowOrderModal(true);
  };

  const handleProductChange = (clientId: string, productId: string) => {
    const product = productLookup[productId];

    setDraftItems((currentItems) =>
      currentItems.map((item) => {
        if (item.clientId !== clientId) {
          return item;
        }

        if (!product) {
          return {
            ...item,
            name: "",
            productId,
          };
        }

        return {
          ...item,
          amount: String(toNairaAmount(getProductSellingPrice(product))),
          name: product.name,
          productId,
        };
      }),
    );
  };

  const handleSaveOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage store orders.");
      return;
    }

    if (!customerName.trim() || !customerEmail.trim() || !customerPhone.trim()) {
      toast.error("Customer name, email, and phone are required.");
      return;
    }

    if (!shippingTier.trim()) {
      toast.error("Select a shipping tier.");
      return;
    }

    if (
      !shippingName.trim() ||
      !shippingPhone.trim() ||
      !shippingAddress.trim() ||
      !shippingCity.trim() ||
      !shippingState.trim()
    ) {
      toast.error("Complete the shipping address before saving.");
      return;
    }

    if (normalizedItems.length === 0) {
      toast.error("Add at least one order item.");
      return;
    }

    setSavingOrder(true);

    try {
      const response = await fetch(
        editingOrder ? `/api/admin/orders/${editingOrder.id}` : "/api/admin/orders",
        {
          method: editingOrder ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            customerEmail,
            customerName,
            customerPhone,
            items: normalizedItems,
            paymentReference,
            shippingAddress: {
              name: shippingName,
              phone: shippingPhone,
              address: shippingAddress,
              city: shippingCity,
              state: shippingState,
            },
            shippingTier,
            status: orderStatus,
            total: totalAmount,
            userId: selectedCustomerId === "__manual__" ? null : selectedCustomerId,
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not save the order.");
        return;
      }

      toast.success(result?.message ?? (editingOrder ? "Order updated." : "Order created."));
      setShowOrderModal(false);
      resetOrderForm();
      await onReload();
    } catch (error) {
      console.error("Failed to save admin order.", error);
      toast.error("Could not save the order.");
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm("Delete this store order?")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage store orders.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not delete the order.");
        return;
      }

      toast.success(result?.message ?? "Order deleted.");
      await onReload();
    } catch (error) {
      console.error("Failed to delete admin order.", error);
      toast.error("Could not delete the order.");
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="space-y-1">
            <CardTitle>Store Orders</CardTitle>
            <p className="text-sm text-gray-500">
              Create, edit, and delete store orders without reloading the dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                resetOrderForm();
                setShowOrderModal(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Order
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-500">No store orders yet.</p>
          ) : (
            <Tabs defaultValue={paidOrders.length > 0 ? "paid" : "unpaid"} className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="paid" className="min-w-0 cursor-pointer whitespace-normal px-3 py-2 text-center text-xs leading-tight sm:text-sm">
                  Paid Orders ({paidOrders.length})
                </TabsTrigger>
                <TabsTrigger value="unpaid" className="min-w-0 cursor-pointer whitespace-normal px-3 py-2 text-center text-xs leading-tight sm:text-sm">
                  Unpaid Orders ({unpaidOrders.length})
                </TabsTrigger>
              </TabsList>

              {[
                { emptyMessage: "No paid store orders yet.", value: "paid", rows: paidOrders },
                {
                  emptyMessage: "No unpaid store orders right now.",
                  value: "unpaid",
                  rows: unpaidOrders,
                },
              ].map((group) => (
                <TabsContent key={group.value} value={group.value}>
                  {group.rows.length === 0 ? (
                    <p className="text-sm text-gray-500">{group.emptyMessage}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Shipping</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.rows.map((order) => {
                          const savedAddress = normalizeShippingAddress(order.shipping_address);
                          return (
                            <TableRow key={order.id}>
                              <TableCell>
                                <div className="font-mono text-sm">{order.id.slice(0, 8)}</div>
                                <div className="text-xs text-gray-500">
                                  {order.shipping_tier || "No shipping tier"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">
                                  {order.customer_name ?? savedAddress.name ?? "N/A"}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {order.customer_email ?? "No email"}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {order.customer_phone ?? savedAddress.phone ?? "No phone"}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {savedAddress.address
                                  ? `${savedAddress.address}, ${savedAddress.city}, ${savedAddress.state}`
                                  : "N/A"}
                              </TableCell>
                              <TableCell>{formatNairaAmount(Number(order.total ?? 0))}</TableCell>
                              <TableCell>{order.status}</TableCell>
                              <TableCell>{formatDateTime(order.created_at)}</TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditOrder(order)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDeleteOrder(order.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? "Edit Store Order" : "Create Store Order"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveOrder} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="order-customer">Customer</Label>
                <Select value={selectedCustomerId} onValueChange={applyCustomerSnapshot}>
                  <SelectTrigger id="order-customer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">Manual / Guest Order</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.full_name || customer.email || customer.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="order-status">Status</Label>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger id="order-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="order-customer-name">Customer Name</Label>
                <Input
                  id="order-customer-name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-customer-email">Customer Email</Label>
                <Input
                  id="order-customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-customer-phone">Customer Phone</Label>
                <Input
                  id="order-customer-phone"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="order-shipping-tier">Shipping Tier</Label>
                <Select value={shippingTier} onValueChange={setShippingTier}>
                  <SelectTrigger id="order-shipping-tier">
                    <SelectValue placeholder="Select shipping tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeShippingTiers.map((tier) => (
                      <SelectItem key={tier.code} value={tier.code}>
                        {tier.label} ({formatNairaAmount(Number(tier.fee ?? 0))})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-reference">Payment Reference</Label>
                <Input
                  id="order-reference"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Order Items</h3>
                  <p className="text-sm text-gray-500">
                    Each price should be entered as a full NGN amount.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setDraftItems((currentItems) => [...currentItems, createEmptyDraftItem()])
                  }
                >
                  <Package className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {draftItems.map((item, index) => (
                  <div key={item.clientId} className="rounded-2xl border p-4">
                    <div className="grid gap-4 md:grid-cols-[1.2fr_1.4fr_0.8fr_0.9fr_auto]">
                      <div className="space-y-2">
                        <Label>Product</Label>
                        <Select
                          value={item.productId || "__manual__"}
                          onValueChange={(value) =>
                            handleProductChange(
                              item.clientId,
                              value === "__manual__" ? "" : value,
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Manual item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__manual__">Manual item</SelectItem>
                            {products.map((product) => (
                              <SelectItem key={product.id} value={String(product.id)}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Item Name</Label>
                        <Input
                          value={item.name}
                          onChange={(event) =>
                            setDraftItems((currentItems) =>
                              currentItems.map((currentItem) =>
                                currentItem.clientId === item.clientId
                                  ? { ...currentItem, name: event.target.value }
                                  : currentItem,
                              ),
                            )
                          }
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) =>
                            setDraftItems((currentItems) =>
                              currentItems.map((currentItem) =>
                                currentItem.clientId === item.clientId
                                  ? { ...currentItem, quantity: event.target.value }
                                  : currentItem,
                              ),
                            )
                          }
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Amount (NGN)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={item.amount}
                          onChange={(event) =>
                            setDraftItems((currentItems) =>
                              currentItems.map((currentItem) =>
                                currentItem.clientId === item.clientId
                                  ? { ...currentItem, amount: event.target.value }
                                  : currentItem,
                              ),
                            )
                          }
                          required
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDraftItems((currentItems) =>
                              currentItems.length === 1
                                ? [createEmptyDraftItem()]
                                : currentItems.filter(
                                    (currentItem) => currentItem.clientId !== item.clientId,
                                  ),
                            )
                          }
                          aria-label={`Remove order item ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                Computed Total: {formatNairaAmount(totalAmount)}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Shipping Address</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shipping-name">Recipient Name</Label>
                  <Input
                    id="shipping-name"
                    value={shippingName}
                    onChange={(event) => setShippingName(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipping-phone">Recipient Phone</Label>
                  <Input
                    id="shipping-phone"
                    value={shippingPhone}
                    onChange={(event) => setShippingPhone(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shipping-address">Street Address</Label>
                <Input
                  id="shipping-address"
                  value={shippingAddress}
                  onChange={(event) => setShippingAddress(event.target.value)}
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shipping-city">City</Label>
                  <Input
                    id="shipping-city"
                    value={shippingCity}
                    onChange={(event) => setShippingCity(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipping-state">State</Label>
                  <Input
                    id="shipping-state"
                    value={shippingState}
                    onChange={(event) => setShippingState(event.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={savingOrder}>
              {savingOrder
                ? "Saving..."
                : editingOrder
                  ? "Update Store Order"
                  : "Create Store Order"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
