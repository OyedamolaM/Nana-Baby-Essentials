"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../../lib/supabase";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface CreateRegistryModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateRegistryModal({
  open,
  onClose,
  onCreated,
}: CreateRegistryModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [registryName, setRegistryName] = useState("");
  const [eventDate, setEventDate] = useState("");

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

      const { error } = await supabase.from("registries").insert({
        user_id: user.id,
        name: registryName,
        event_date: eventDate,
        share_code: shareCode,
      });

      if (error) {
        throw error;
      }

      toast.success("Registry created successfully.");
      onCreated();
      onClose();
      setRegistryName("");
      setEventDate("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create registry.";
      toast.error(message);
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Baby Registry</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="registry-name">Registry Name</Label>
            <Input
              id="registry-name"
              placeholder="Our Baby's Registry"
              value={registryName}
              onChange={(event) => setRegistryName(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-date">Expected Due Date / Event Date</Label>
            <Input
              id="event-date"
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              required
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
