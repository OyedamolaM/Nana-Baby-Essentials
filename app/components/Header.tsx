'use client'

import Link from "next/link";
import { useState } from "react";
import { Baby, LayoutDashboard, LogOut, Menu, Shield, ShoppingCart, User } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type NavSection = "home" | "products" | "about" | "faq";

interface HeaderProps {
  cartItemCount: number;
  isAuthenticated: boolean;
  isAdmin: boolean;
  onCartClick: () => void;
  onNavigate: (section: NavSection) => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
}

const navItems: { id: NavSection; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "products", label: "Products" },
  { id: "about", label: "About" },
  { id: "faq", label: "FAQ" },
];

export function Header({
  cartItemCount,
  isAuthenticated,
  isAdmin,
  onCartClick,
  onNavigate,
  onSignIn,
  onSignUp,
  onOpenDashboard,
  onOpenAdmin,
  onSignOut,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavigate = (section: NavSection) => {
    setMobileMenuOpen(false);
    onNavigate(section);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur">
      <div className="relative w-full px-4 lg:px-6">
        <div className="flex min-h-16 items-center justify-between">

          {/* LEFT: Brand */}
          <button
            type="button"
            className="flex items-center gap-2 text-left z-10"
            onClick={() => handleNavigate("home")}
          >
            <Baby className="h-7 w-7 sm:h-8 sm:w-8 text-pink-500 shrink-0" />

            <div className="flex flex-col leading-tight">
              <p className="text-sm sm:text-lg font-semibold text-gray-900 leading-tight">
                Nana&apos;s Baby
              </p>
              <p className="text-xs sm:text-sm text-gray-700 leading-tight">
                Essentials
              </p>
            </div>
          </button>

          {/* CENTER: Nav (absolute centered) */}
          <nav className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="cursor-pointer text-sm font-medium transition-colors hover:text-pink-600"
                onClick={() => handleNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}

            <Link
              href="/registry"
              className="text-sm font-medium transition-colors hover:text-pink-600"
            >
              Baby Registry
            </Link>

            <Link
              href="/blog"
              className="text-sm font-medium transition-colors hover:text-pink-600"
            >
              Blog
            </Link>
          </nav>

          {/* RIGHT: Actions */}
          <div className="flex items-center gap-2 shrink-0 z-10">
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

                  {isAdmin && (
                    <DropdownMenuItem onClick={onOpenAdmin}>
                      <Shield className="mr-2 h-4 w-4" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}

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
                    <DropdownMenuItem onClick={onSignIn}>
                      Sign In
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onSignUp}>
                      Sign Up
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            {/* Cart */}
            <Button
              variant="outline"
              size="icon"
              type="button"
              className="relative"
              onClick={onCartClick}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full p-0"
                >
                  {cartItemCount}
                </Badge>
              )}
            </Button>

            {/* Mobile Menu */}
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

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="absolute inset-x-0 top-full z-50 border-t bg-white px-4 py-4 shadow-xl lg:hidden">
            <nav className="flex flex-col gap-3">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="cursor-pointer text-left text-sm font-medium hover:text-pink-600"
                  onClick={() => handleNavigate(item.id)}
                >
                  {item.label}
                </button>
              ))}

              <Link href="/registry" onClick={() => setMobileMenuOpen(false)}>
                Baby Registry
              </Link>

              <Link href="/blog" onClick={() => setMobileMenuOpen(false)}>
                Blog
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
