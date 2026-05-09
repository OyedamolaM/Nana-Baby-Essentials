"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "../../contexts/AuthContext";

export function ProfileCompletionGate() {
  const { isAccountDisabled, loading, signOut, user } = useAuth();
  const router = useRouter();
  const disabledHandledRef = useRef(false);

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    if (isAccountDisabled && !disabledHandledRef.current) {
      disabledHandledRef.current = true;
      toast.error("This account has been disabled. Please contact support.");
      void signOut().finally(() => {
        router.replace("/");
      });
    }
  }, [isAccountDisabled, loading, router, signOut, user]);

  return null;
}
