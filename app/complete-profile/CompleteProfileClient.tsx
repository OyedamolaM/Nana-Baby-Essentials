"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../contexts/AuthContext";

export function CompleteProfileClient() {
  const { loading, profile, updateProfile, user } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const phoneValue = phone ?? profile?.phone ?? "";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!phoneValue.trim()) {
      toast.error("Phone number is required.");
      return;
    }

    setSubmitting(true);
    const { error } = await updateProfile({
      phone: phoneValue.trim(),
    });

    setSubmitting(false);

    if (error) {
      toast.error(error.message || "Could not save your profile yet.");
      return;
    }

    toast.success("Phone number saved.");
    router.replace("/dashboard/profile");
  };

  if (loading) {
    return <div className="container mx-auto px-4 py-16">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-600">
            Please sign in before completing your profile.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Add Your Phone Number</CardTitle>
          <p className="text-sm text-gray-600">
            Save a phone number to your account so checkout can fill faster next time.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="complete-phone">Phone Number</Label>
              <Input
                id="complete-phone"
                value={phoneValue}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+234..."
                required
              />
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Phone Number"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
