"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

function readHashTokens() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const access_token = params.get("access_token") ?? "";
  const refresh_token = params.get("refresh_token") ?? "";
  return { access_token, refresh_token };
}

function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in...");
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const next = searchParams.get("next") || "/";

    (async () => {
      const code = searchParams.get("code");

      if (code) {
        // PKCE flow
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage("We couldn't complete your sign-in. Please try again.");
          return;
        }
      } else {
        // Implicit flow: tokens arrive in the URL hash
        const { access_token, refresh_token } = readHashTokens();
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            setMessage("We couldn't complete your sign-in. Please try again.");
            return;
          }
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.replace(next);
      } else {
        setMessage("This verification link is invalid or has already been used.");
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-pink-600 border-t-transparent" />
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackHandler />
    </Suspense>
  );
}
