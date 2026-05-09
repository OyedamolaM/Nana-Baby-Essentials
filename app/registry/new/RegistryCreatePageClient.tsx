"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { formatNaira } from "../../../lib/commerce";
import {
  clearRegistryCart,
  readRegistryCart,
  removeRegistryCartItem,
  updateRegistryCartQuantity,
  type RegistryCartItem,
} from "../../../lib/registryCart";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { useAuth } from "../../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";

function generateShareCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function RegistryCreatePageClient() {
  const router = useRouter();
  const { session, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [registryName, setRegistryName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [dueMonth, setDueMonth] = useState("");
  const [babyGender, setBabyGender] = useState("neutral");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [registryCartItems, setRegistryCartItems] = useState<RegistryCartItem[]>([]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setRegistryCartItems(readRegistryCart());
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const handleUpdateRegistryCartItem = (productId: number, quantity: number) => {
    setRegistryCartItems(updateRegistryCartQuantity(productId, quantity));
  };

  const handleRemoveRegistryCartItem = (productId: number) => {
    setRegistryCartItems(removeRegistryCartItem(productId));
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      toast.error("Please sign in to create a registry.");
      return;
    }

    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    setLoading(true);

    try {
      const shareCode = generateShareCode();
      const { data: registry, error } = await supabase
        .from("registries")
        .insert({
          user_id: user.id,
          name: registryName,
          whatsapp,
          due_month: dueMonth,
          baby_gender: babyGender,
          additional_info: additionalInfo,
          share_code: shareCode,
        })
        .select("id, share_code")
        .single();

      if (error || !registry) {
        throw error ?? new Error("Failed to create registry.");
      }

      if (registryCartItems.length > 0) {
        const { error: registryItemsError } = await supabase.from("registry_items").insert(
          registryCartItems.map((item) => ({
            registry_id: registry.id,
            product_id: item.product.id,
            requested_quantity: item.quantity,
            purchased_quantity: 0,
            funded_amount: 0,
            unit_price_snapshot: item.product.price,
            note: "",
          })),
        );

        if (registryItemsError) {
          throw registryItemsError;
        }
      }

      if (session?.access_token) {
        await fetch("/api/registry/created", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ registryId: registry.id }),
        }).catch(() => null);
      }

      clearRegistryCart();
      toast.success("Your registry is ready.");
      router.push(`/dashboard/registries/${registry.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create registry.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-600">
            <p>Create an account or sign in before creating a new registry.</p>
            <Button asChild>
              <Link href="/registry">Back to Registry</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-pink-50 via-white to-blue-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-3xl">Create New Registry</CardTitle>
              <p className="text-sm text-gray-600">
                This is now a full-page flow. Once you create the registry, any
                items in your registry cart will be attached automatically.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="registry-name">Registry Name</Label>
                  <Input
                    id="registry-name"
                    value={registryName}
                    onChange={(event) => setRegistryName(event.target.value)}
                    placeholder="e.g. Ada's Baby Registry"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registry-whatsapp">WhatsApp Number</Label>
                  <Input
                    id="registry-whatsapp"
                    value={whatsapp}
                    onChange={(event) => setWhatsapp(event.target.value)}
                    placeholder="+234..."
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="registry-due-month">Expected Due Month</Label>
                    <Input
                      id="registry-due-month"
                      type="month"
                      value={dueMonth}
                      onChange={(event) => setDueMonth(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="registry-gender">Baby&apos;s Gender</Label>
                    <Select value={babyGender} onValueChange={setBabyGender}>
                      <SelectTrigger id="registry-gender">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Boy</SelectItem>
                        <SelectItem value="female">Girl</SelectItem>
                        <SelectItem value="neutral">Surprise / Neutral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registry-info">Additional Information</Label>
                  <Textarea
                    id="registry-info"
                    value={additionalInfo}
                    onChange={(event) => setAdditionalInfo(event.target.value)}
                    rows={4}
                    placeholder="Any preferences, notes, or details for your registry..."
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="submit" disabled={loading}>
                    {loading ? "Creating..." : "Create Registry"}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link href="/registry">Back to Registry Catalog</Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Registry Cart</CardTitle>
              <p className="text-sm text-gray-600">
                Items added before registry creation stay here until you attach them.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {registryCartItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-gray-500">
                  Your registry cart is empty. Browse the registry page to add items first.
                </div>
              ) : (
                registryCartItems.map((item) => (
                  <div key={item.product.id} className="rounded-2xl border p-4">
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{item.product.name}</p>
                        <p className="text-sm text-gray-500">{item.product.category}</p>
                        <p className="mt-2 text-sm font-medium text-pink-600">
                          {formatNaira(item.product.price)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full border px-2 py-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              handleUpdateRegistryCartItem(item.product.id, item.quantity - 1)
                            }
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="min-w-6 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              handleUpdateRegistryCartItem(item.product.id, item.quantity + 1)
                            }
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleRemoveRegistryCartItem(item.product.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" asChild>
                  <Link href="/registry">Add More Items</Link>
                </Button>
                {registryCartItems.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      clearRegistryCart();
                      setRegistryCartItems([]);
                    }}
                  >
                    Clear Registry Cart
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
