"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  User,
} from "lucide-react";

import { type StoreLocationRecord } from "../../../lib/storeLocations";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface RegistryHeaderProps {
  cartItemCount: number;
  isAdmin: boolean;
  isAuthenticated: boolean;
  locations?: StoreLocationRecord[];
  onCartClick: () => void;
  onOpenAdmin: () => void;
  onOpenDashboard: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onSignUp: () => void;
}

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/registry#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
] as const;

export function RegistryHeader({
  cartItemCount,
  isAdmin,
  isAuthenticated,
  locations = [],
  onCartClick,
  onOpenAdmin,
  onOpenDashboard,
  onSignIn,
  onSignOut,
  onSignUp,
}: RegistryHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        headerRef.current &&
        !headerRef.current.contains(event.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur"
    >
      <div className="relative w-full px-4 lg:px-6">
        <div className="flex min-h-16 items-center justify-between">
          <Link
            href="/registry"
            className="z-10 flex items-center gap-2 text-left"
            onClick={closeMobileMenu}
          >
            <img
              src="/logo.jpg"
              alt="Nana's Baby Registry logo"
              className="h-7 w-7 shrink-0 text-pink-500 sm:h-8 sm:w-8"
            />

            <div className="flex flex-col leading-tight">
              <p className="font-serif text-sm font-medium italic leading-tight tracking-tight text-[#7c3a67] sm:text-xl">
                Nana&apos;s Baby
              </p>
              <p className="font-serif text-xs font-medium italic leading-tight tracking-tight text-[#9a5d84] sm:text-base">
                Registry
              </p>
            </div>
          </Link>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="cursor-pointer text-sm font-medium transition-colors hover:text-pink-600"
              >
                {link.label}
              </Link>
            ))}

            <Link
              href="/locations"
              className="text-sm font-medium transition-colors hover:text-pink-600"
            >
              Locations
            </Link>
          </nav>

          <div className="z-10 flex shrink-0 items-center gap-2">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" type="button">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onOpenDashboard}>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    My Dashboard
                  </DropdownMenuItem>

                  {isAdmin ? (
                    <DropdownMenuItem onClick={onOpenAdmin}>
                      <Shield className="mr-2 h-4 w-4" />
                      Admin Panel
                    </DropdownMenuItem>
                  ) : null}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={onSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button
                  variant="outline"
                  type="button"
                  className="hidden md:inline-flex"
                  onClick={onSignIn}
                >
                  Sign In
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="md:hidden"
                    >
                      <User className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onSignIn}>Sign In</DropdownMenuItem>
                    <DropdownMenuItem onClick={onSignUp}>Sign Up</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            <Button
              variant="outline"
              size="icon"
              type="button"
              className="relative"
              onClick={onCartClick}
            >
              <Gift className="h-5 w-5" />
              {cartItemCount > 0 ? (
                <Badge
                  variant="destructive"
                  className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full p-0"
                >
                  {cartItemCount}
                </Badge>
              ) : null}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div className="absolute inset-x-0 top-full z-50 border-t bg-white px-4 py-4 shadow-xl lg:hidden">
            <nav className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-normal hover:text-pink-600"
                  onClick={closeMobileMenu}
                >
                  {link.label}
                </Link>
              ))}

              <Link
                href="/locations"
                className="text-sm font-normal hover:text-pink-600"
                onClick={closeMobileMenu}
              >
                Locations
              </Link>
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
