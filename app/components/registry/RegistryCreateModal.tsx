"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  clearRegistryCart,
  readRegistryCart,
} from "../../../lib/registryCart";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "../ui/textarea";
import { useAuth } from "../../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";

function generateShareCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

interface RegistryCreateModalProps {
  onCreated?: (registryId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RegistryCreateModal({
  onCreated,
  open,
  onOpenChange,
}: RegistryCreateModalProps) {
  const { session, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [registryName, setRegistryName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [dueMonth, setDueMonth] = useState("");
  const [babyGender, setBabyGender] = useState("neutral");
  const [additionalInfo, setAdditionalInfo] = useState("");

  const resetForm = () => {
    setRegistryName("");
    setWhatsapp("");
    setDueMonth("");
    setBabyGender("neutral");
    setAdditionalInfo("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !loading) {
      resetForm();
    }

    onOpenChange(nextOpen);
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
      const registryCartItems = readRegistryCart();

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
        .select("id")
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

        clearRegistryCart();
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

      toast.success("Your registry is ready.");
      resetForm();
      onOpenChange(false);
      onCreated?.(registry.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create registry.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Registry</DialogTitle>
          <DialogDescription>
            Create your registry first. After that, you can keep adding items from the
            registry catalog whenever you like.
          </DialogDescription>
        </DialogHeader>

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

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create Registry"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
