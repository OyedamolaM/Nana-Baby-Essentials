"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Edit, Gift, PackageCheck, Plus, RotateCcw, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

import { formatNairaAmount } from "../../../lib/commerce";
import {
  getRegistryItemSelectionAmount,
  getRemainingRegistryQuantity,
  type RegistryItem,
  type RegistryOrderItemRecord,
  type RegistryOrderRecord,
} from "../../../lib/registry";
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
import { Textarea } from "../ui/textarea";

type RegistryRecord = {
  completed_at?: string | null;
  fulfillment_status?: "collecting" | "ready_for_shipping" | "shipped" | "completed" | null;
  id: string;
  name: string;
  ready_for_shipping_at?: string | null;
  share_code: string;
  shipped_at?: string | null;
  status?: string | null;
  user_id: string;
};

type CustomerRecord = {
  email?: string | null;
  full_name?: string | null;
  id: string;
  phone?: string | null;
  shipping_address?: Partial<ShippingAddress> | null;
};

type DraftRegistryOrderItem = {
  amount: string;
  clientId: string;
  productId: number | null;
  quantity: string;
  registryItemId: string;
};

const REGISTRY_ORDER_STATUS_OPTIONS = [
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Awaiting Payment", value: "awaiting_payment" },
  { label: "Cancelled", value: "cancelled" },
] as const;

function createDraftId() {
  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyDraftItem(): DraftRegistryOrderItem {
  return {
    amount: "",
    clientId: createDraftId(),
    productId: null,
    quantity: "1",
    registryItemId: "__cash__",
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

export function AdminRegistryOrdersManager({
  customers,
  getAdminAccessToken,
  onReload,
  orderItemsByOrderId,
  orders,
  registries,
  registryItemsByRegistry,
}: {
  customers: CustomerRecord[];
  getAdminAccessToken: () => Promise<string | null>;
  onReload: () => Promise<void>;
  orderItemsByOrderId: Record<string, RegistryOrderItemRecord[]>;
  orders: RegistryOrderRecord[];
  registries: RegistryRecord[];
  registryItemsByRegistry: Record<string, RegistryItem[]>;
}) {
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<RegistryOrderRecord | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingRegistryId, setSavingRegistryId] = useState<string | null>(null);
  const [selectedRegistryId, setSelectedRegistryId] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerMessage, setBuyerMessage] = useState("");
  const [orderStatus, setOrderStatus] = useState("paid");
  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [draftItems, setDraftItems] = useState<DraftRegistryOrderItem[]>([
    createEmptyDraftItem(),
  ]);

  const registryLookup = useMemo(() => {
    return Object.fromEntries(registries.map((registry) => [registry.id, registry])) as Record<
      string,
      RegistryRecord
    >;
  }, [registries]);

  const customerLookup = useMemo(() => {
    return Object.fromEntries(customers.map((customer) => [customer.id, customer])) as Record<
      string,
      CustomerRecord
    >;
  }, [customers]);

  const availableRegistryItems = useMemo(() => {
    return registryItemsByRegistry[selectedRegistryId] ?? [];
  }, [registryItemsByRegistry, selectedRegistryId]);

  const registryItemLookup = useMemo(() => {
    return Object.fromEntries(
      availableRegistryItems.map((item) => [item.id, item]),
    ) as Record<string, RegistryItem>;
  }, [availableRegistryItems]);

  const normalizedItems = useMemo(() => {
    return draftItems
      .map((item) => ({
        amount: Math.max(0, Math.round(Number(item.amount || 0))),
        productId: item.registryItemId === "__cash__" ? null : item.productId,
        quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
        registryItemId: item.registryItemId === "__cash__" ? null : item.registryItemId,
      }))
      .filter((item) => item.amount > 0);
  }, [draftItems]);

  const totalAmount = useMemo(() => {
    return normalizedItems.reduce((sum, item) => sum + item.amount, 0);
  }, [normalizedItems]);

  const applyRegistryShipping = (registryId: string) => {
    setSelectedRegistryId(registryId);

    const registry = registryLookup[registryId];
    if (!registry) {
      return;
    }

    const owner = customerLookup[registry.user_id];
    const savedAddress = normalizeShippingAddress(owner?.shipping_address);
    setShippingName(savedAddress.name || owner?.full_name || "");
    setShippingPhone(savedAddress.phone || owner?.phone || "");
    setShippingAddress(savedAddress.address);
    setShippingCity(savedAddress.city);
    setShippingState(savedAddress.state);
  };

  const resetOrderForm = () => {
    setEditingOrder(null);
    setSelectedRegistryId("");
    setBuyerName("");
    setBuyerEmail("");
    setBuyerPhone("");
    setBuyerMessage("");
    setOrderStatus("paid");
    setShippingName("");
    setShippingPhone("");
    setShippingAddress("");
    setShippingCity("");
    setShippingState("");
    setDraftItems([createEmptyDraftItem()]);
  };

  const handleEditOrder = (order: RegistryOrderRecord) => {
    const savedAddress = normalizeShippingAddress(
      order.shipping_address as Partial<ShippingAddress> | null | undefined,
    );
    setEditingOrder(order);
    setSelectedRegistryId(order.registry_id);
    setBuyerName(order.buyer_name);
    setBuyerEmail(order.buyer_email);
    setBuyerPhone(order.buyer_phone ?? "");
    setBuyerMessage(order.buyer_message ?? "");
    setOrderStatus(order.status);
    setShippingName(savedAddress.name);
    setShippingPhone(savedAddress.phone);
    setShippingAddress(savedAddress.address);
    setShippingCity(savedAddress.city);
    setShippingState(savedAddress.state);
    setDraftItems(
      (orderItemsByOrderId[order.id] ?? []).length > 0
        ? (orderItemsByOrderId[order.id] ?? []).map((item) => ({
            amount: String(Math.max(0, Math.round(Number(item.amount ?? 0)))),
            clientId: createDraftId(),
            productId: item.product_id ? Number(item.product_id) : null,
            quantity: String(Math.max(1, Math.floor(Number(item.quantity ?? 1)))),
            registryItemId: item.registry_item_id ?? "__cash__",
          }))
        : [createEmptyDraftItem()],
    );
    setShowOrderModal(true);
  };

  const handleDraftRegistryItemChange = (
    clientId: string,
    nextRegistryItemId: string,
  ) => {
    setDraftItems((currentItems) =>
      currentItems.map((item) => {
        if (item.clientId !== clientId) {
          return item;
        }

        if (nextRegistryItemId === "__cash__") {
          return {
            ...item,
            productId: null,
            registryItemId: "__cash__",
          };
        }

        const registryItem = registryItemLookup[nextRegistryItemId];
        if (!registryItem) {
          return item;
        }

        const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
        return {
          ...item,
          amount: String(getRegistryItemSelectionAmount(registryItem, quantity)),
          productId: registryItem.productId,
          registryItemId: nextRegistryItemId,
        };
      }),
    );
  };

  const handleDraftQuantityChange = (clientId: string, nextQuantity: string) => {
    setDraftItems((currentItems) =>
      currentItems.map((item) => {
        if (item.clientId !== clientId) {
          return item;
        }

        if (item.registryItemId === "__cash__") {
          return {
            ...item,
            quantity: nextQuantity,
          };
        }

        const registryItem = registryItemLookup[item.registryItemId];
        if (!registryItem) {
          return {
            ...item,
            quantity: nextQuantity,
          };
        }

        const quantity = Math.max(1, Math.floor(Number(nextQuantity || 1)));
        return {
          ...item,
          amount: String(getRegistryItemSelectionAmount(registryItem, quantity)),
          quantity: nextQuantity,
        };
      }),
    );
  };

  const handleSaveOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage registry orders.");
      return;
    }

    if (!selectedRegistryId) {
      toast.error("Select a registry.");
      return;
    }

    if (!buyerName.trim() || !buyerEmail.trim() || !buyerPhone.trim()) {
      toast.error("Buyer name, email, and phone are required.");
      return;
    }

    if (
      !shippingName.trim() ||
      !shippingPhone.trim() ||
      !shippingAddress.trim() ||
      !shippingCity.trim() ||
      !shippingState.trim()
    ) {
      toast.error("Complete the destination shipping address before saving.");
      return;
    }

    if (normalizedItems.length === 0) {
      toast.error("Add at least one registry order item or cash gift row.");
      return;
    }

    setSavingOrder(true);

    try {
      const response = await fetch(
        editingOrder
          ? `/api/admin/registry-orders/${editingOrder.id}`
          : "/api/admin/registry-orders",
        {
          method: editingOrder ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            buyerEmail,
            buyerMessage,
            buyerName,
            buyerPhone,
            items: normalizedItems,
            registryId: selectedRegistryId,
            shippingAddress: {
              name: shippingName,
              phone: shippingPhone,
              address: shippingAddress,
              city: shippingCity,
              state: shippingState,
            },
            status: orderStatus,
            totalAmount,
          }),
        },
      );

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not save the registry order.");
        return;
      }

      toast.success(
        result?.message ?? (editingOrder ? "Registry order updated." : "Registry order created."),
      );
      setShowOrderModal(false);
      resetOrderForm();
      await onReload();
    } catch (error) {
      console.error("Failed to save admin registry order.", error);
      toast.error("Could not save the registry order.");
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm("Delete this registry order? Funding totals will be recalculated.")) {
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to manage registry orders.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/registry-orders/${orderId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Could not delete the registry order.");
        return;
      }

      toast.success(result?.message ?? "Registry order deleted.");
      await onReload();
    } catch (error) {
      console.error("Failed to delete admin registry order.", error);
      toast.error("Could not delete the registry order.");
    }
  };

  const handleRegistryFulfillment = async (
    registry: RegistryRecord,
    status: "collecting" | "ready_for_shipping" | "shipped" | "completed",
  ) => {
    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to update registry fulfilment.");
      return;
    }

    setSavingRegistryId(registry.id);
    try {
      const response = await fetch(`/api/registry/${registry.id}/fulfillment`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.message || "Registry fulfilment status could not be updated.");
        return;
      }

      toast.success(result?.message || "Registry updated.");
      await onReload();
    } catch (error) {
      console.error("Failed to update registry fulfilment.", error);
      toast.error("Registry fulfilment status could not be updated.");
    } finally {
      setSavingRegistryId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Registry Fulfilment</CardTitle>
          <p className="text-sm text-gray-500">
            Owners or admins mark paid items ready. Admins confirm dispatch, and either side can
            confirm completion.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {registries.length === 0 ? (
            <p className="text-sm text-gray-500">No registries yet.</p>
          ) : (
            registries.map((registry) => {
              const fulfillmentStatus = registry.fulfillment_status ?? "collecting";
              const owner = customerLookup[registry.user_id];
              const ownerAddress = normalizeShippingAddress(owner?.shipping_address);
              return (
                <div
                  key={registry.id}
                  className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="font-semibold">{registry.name}</p>
                    <p className="text-sm text-gray-500">
                      {owner?.full_name || owner?.email || "Registry owner"} ·{" "}
                      <span className="capitalize">
                        {fulfillmentStatus.replaceAll("_", " ")}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {ownerAddress.address
                        ? `${ownerAddress.address}, ${ownerAddress.city}, ${ownerAddress.state}`
                        : "Owner shipping address not yet saved"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fulfillmentStatus === "collecting" ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          void handleRegistryFulfillment(registry, "ready_for_shipping")
                        }
                        disabled={savingRegistryId === registry.id}
                      >
                        <PackageCheck className="mr-2 h-4 w-4" />
                        Mark Ready
                      </Button>
                    ) : null}
                    {fulfillmentStatus === "ready_for_shipping" ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void handleRegistryFulfillment(registry, "shipped")}
                          disabled={savingRegistryId === registry.id}
                        >
                          <Truck className="mr-2 h-4 w-4" />
                          Mark Shipped
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleRegistryFulfillment(registry, "collecting")}
                          disabled={savingRegistryId === registry.id}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Continue Collecting
                        </Button>
                      </>
                    ) : null}
                    {fulfillmentStatus === "shipped" ? (
                      <Button
                        size="sm"
                        onClick={() => void handleRegistryFulfillment(registry, "completed")}
                        disabled={savingRegistryId === registry.id}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Complete
                      </Button>
                    ) : null}
                    {fulfillmentStatus === "completed" ? (
                      <span className="rounded-full bg-green-100 px-3 py-2 text-sm font-semibold text-green-800">
                        Completed
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div className="space-y-1">
            <CardTitle>Registry Orders</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                resetOrderForm();
                setShowOrderModal(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Registry Order
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-500">No registry orders yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registry</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const registry = registryLookup[order.registry_id];
                  const savedAddress = normalizeShippingAddress(
                    order.shipping_address as Partial<ShippingAddress> | null | undefined,
                  );

                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{registry?.name ?? "Registry"}</div>
                        <div className="text-xs text-gray-500">
                          {registry?.share_code ?? order.registry_id.slice(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{order.buyer_name}</div>
                        <div className="text-xs text-gray-500">{order.buyer_email}</div>
                        <div className="text-xs text-gray-500">
                          {order.buyer_phone ?? "No phone"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {savedAddress.address
                          ? `${savedAddress.address}, ${savedAddress.city}, ${savedAddress.state}`
                          : "N/A"}
                      </TableCell>
                      <TableCell>{formatNairaAmount(Number(order.total_amount ?? 0))}</TableCell>
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
        </CardContent>
      </Card>

      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingOrder ? "Edit Registry Order" : "Create Registry Order"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveOrder} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registry-order-registry">Registry</Label>
                <Select value={selectedRegistryId} onValueChange={applyRegistryShipping}>
                  <SelectTrigger id="registry-order-registry">
                    <SelectValue placeholder="Select registry" />
                  </SelectTrigger>
                  <SelectContent>
                    {registries.map((registry) => (
                      <SelectItem key={registry.id} value={registry.id}>
                        {registry.name?.trim() || "Unnamed registry"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="registry-order-status">Status</Label>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger id="registry-order-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGISTRY_ORDER_STATUS_OPTIONS.map((option) => (
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
                <Label htmlFor="registry-order-buyer-name">Buyer Name</Label>
                <Input
                  id="registry-order-buyer-name"
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="registry-order-buyer-email">Buyer Email</Label>
                <Input
                  id="registry-order-buyer-email"
                  type="email"
                  value={buyerEmail}
                  onChange={(event) => setBuyerEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="registry-order-buyer-phone">Buyer Phone</Label>
                <Input
                  id="registry-order-buyer-phone"
                  value={buyerPhone}
                  onChange={(event) => setBuyerPhone(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="registry-order-message">Buyer Message</Label>
              <Textarea
                id="registry-order-message"
                value={buyerMessage}
                onChange={(event) => setBuyerMessage(event.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Contribution Rows</h3>
                  <p className="text-sm text-gray-500">
                    Choose registry items or leave a row as a cash gift contribution.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setDraftItems((currentItems) => [...currentItems, createEmptyDraftItem()])
                  }
                >
                  <Gift className="mr-2 h-4 w-4" />
                  Add Row
                </Button>
              </div>

              <div className="space-y-3">
                {draftItems.map((item, index) => (
                  <div key={item.clientId} className="rounded-2xl border p-4">
                    <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr_0.9fr_auto]">
                      <div className="space-y-2">
                        <Label>Gift Type</Label>
                        <Select
                          value={item.registryItemId}
                          onValueChange={(value) =>
                            handleDraftRegistryItemChange(item.clientId, value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select registry item or cash gift" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__cash__">Cash Gift / General contribution</SelectItem>
                            {availableRegistryItems.map((registryItem) => (
                              <SelectItem key={registryItem.id} value={registryItem.id}>
                                {(registryItem.product?.name ?? "Registry item") +
                                  ` (${getRemainingRegistryQuantity(registryItem)} left)`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) =>
                            handleDraftQuantityChange(item.clientId, event.target.value)
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
                          aria-label={`Remove registry order row ${index + 1}`}
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
              <h3 className="text-sm font-semibold text-gray-900">Destination Shipping Address</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registry-order-shipping-name">Recipient Name</Label>
                  <Input
                    id="registry-order-shipping-name"
                    value={shippingName}
                    onChange={(event) => setShippingName(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registry-order-shipping-phone">Recipient Phone</Label>
                  <Input
                    id="registry-order-shipping-phone"
                    value={shippingPhone}
                    onChange={(event) => setShippingPhone(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="registry-order-shipping-address">Street Address</Label>
                <Input
                  id="registry-order-shipping-address"
                  value={shippingAddress}
                  onChange={(event) => setShippingAddress(event.target.value)}
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registry-order-shipping-city">City</Label>
                  <Input
                    id="registry-order-shipping-city"
                    value={shippingCity}
                    onChange={(event) => setShippingCity(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registry-order-shipping-state">State</Label>
                  <Input
                    id="registry-order-shipping-state"
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
                  ? "Update Registry Order"
                  : "Create Registry Order"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
