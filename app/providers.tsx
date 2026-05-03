"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "./components/ui/sonner";
import { StoreCartProvider } from "./contexts/StoreCartContext";
import { AuthProvider } from "./contexts/AuthContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <StoreCartProvider>
          {children}
          <Toaster />
        </StoreCartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
