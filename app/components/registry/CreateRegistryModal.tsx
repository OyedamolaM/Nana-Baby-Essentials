"use client";

import { useState } from "react";
import { PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";
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

interface CreateRegistryModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (shareCode: string) => void;
}

export function CreateRegistryModal({
  open,
  onClose,
  onCreated,
}: CreateRegistryModalProps) {
  const { session, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [registryName, setRegistryName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [dueMonth, setDueMonth] = useState("");
  const [babyGender, setBabyGender] = useState("neutral");
  const [additionalInfo, setAdditionalInfo] = useState("");

  const generateShareCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  const handleCreate = async (event: React.FormEvent) => {
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

      let emailNotice =
        "We sent a confirmation email with your registry link.";

      if (!session?.access_token) {
        emailNotice = "Your registry is ready. Please sign in again if you need the confirmation email resent.";
      } else {
        const emailResponse = await fetch("/api/registry/created", {
          body: JSON.stringify({ registryId: registry.id }),
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        if (!emailResponse.ok) {
          const payload = (await emailResponse.json().catch(() => null)) as
            | { message?: string }
            | null;

          emailNotice =
            payload?.message?.trim() ||
            "Your registry was created, but the confirmation email could not be sent yet.";
        } else {
          const payload = (await emailResponse.json().catch(() => null)) as
            | { sandbox?: boolean }
            | null;

          if (payload?.sandbox) {
            emailNotice =
              "Brevo sandbox accepted your registry email. Turn off BREVO_SANDBOX_MODE to deliver real emails.";
          }
        }
      }

      toast.success(
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <PartyPopper className="h-4 w-4" />
            We got your registry request!
          </p>
          <p className="text-sm">
            Our registry rep will call you within 24h to confirm your list.
          </p>
          <p className="text-sm text-emerald-700">{emailNotice}</p>
        </div>,
        { duration: 6000 },
      );

      onCreated(registry.share_code);
      onClose();
      setRegistryName("");
      setWhatsapp("");
      setDueMonth("");
      setBabyGender("neutral");
      setAdditionalInfo("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create registry.";
      toast.error(message);
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Your Baby Registry</DialogTitle>
          <DialogDescription>
            Fill in the details below and we&apos;ll help you create the
            perfect registry for your little one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="registry-name">Registry Name *</Label>
            <Input
              id="registry-name"
              placeholder="e.g., Sarah's Baby Registry"
              value={registryName}
              onChange={(event) => setRegistryName(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp Number *</Label>
            <Input
              id="whatsapp"
              type="tel"
              placeholder="+234 801 234 5678"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="due-month">Expected Due Month *</Label>
            <Input
              id="due-month"
              type="month"
              value={dueMonth}
              onChange={(event) => setDueMonth(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="baby-gender">Baby&apos;s Gender *</Label>
            <Select value={babyGender} onValueChange={setBabyGender}>
              <SelectTrigger id="baby-gender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Boy</SelectItem>
                <SelectItem value="female">Girl</SelectItem>
                <SelectItem value="neutral">Surprise / Neutral</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="additional-info">
              Additional Information (Optional)
            </Label>
            <Textarea
              id="additional-info"
              placeholder="Any special requests, preferences, or information we should know..."
              value={additionalInfo}
              onChange={(event) => setAdditionalInfo(event.target.value)}
              rows={3}
            />
          </div>

          <div className="rounded-lg bg-pink-50 p-4 text-sm">
            <p className="mb-2 font-semibold text-pink-900">Special Offers:</p>
            <ul className="space-y-1 text-pink-800">
              <li>
                Get a box of lactation cookies when your registry orders hit
                N500,000
              </li>
              <li>
                Get 5% cashback when your registry orders hit N1,000,000
              </li>
            </ul>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create My Registry"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
