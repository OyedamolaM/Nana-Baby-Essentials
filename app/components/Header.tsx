'use client'

import { useState } from "react";
import {
  Baby,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type StoreView = "store" | "dashboard" | "admin";
type NavSection = "home" | "products" | "registry" | "about" | "faq";

interface HeaderProps {
  activeView: StoreView;
  cartItemCount: number;
  isAuthenticated: boolean;
  isAdmin: boolean;
  showSearch?: boolean;
  onCartClick: () => void;
  onSearch: (query: string) => void;
  onNavigate: (section: NavSection) => void;
  onSignIn: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
}

const navItems: { id: NavSection; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "products", label: "Products" },
  { id: "registry", label: "Registry" },
  { id: "about", label: "About" },
  { id: "faq", label: "FAQ" },
];

export function Header({
  activeView,
  cartItemCount,
  isAuthenticated,
  isAdmin,
  showSearch = true,
  onCartClick,
  onSearch,
  onNavigate,
  onSignIn,
  onOpenDashboard,
  onOpenAdmin,
  onSignOut,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch(searchQuery);
  };

  const handleNavigate = (section: NavSection) => {
    setMobileMenuOpen(false);
    onNavigate(section);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            onClick={() => handleNavigate("home")}
          >
            <Baby className="h-8 w-8 text-pink-500" />
            <div>
              <p className="text-lg font-semibold text-gray-900">
                Nana&apos;s Baby Essentials
              </p>
              <p className="text-xs text-gray-500">
                {activeView === "store"
                  ? "Storefront"
                  : activeView === "admin"
                    ? "Admin"
                    : "My Account"}
              </p>
            </div>
          </button>

          <nav className="hidden items-center gap-6 lg:flex">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="text-sm font-medium transition-colors hover:text-pink-600"
                onClick={() => handleNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {showSearch ? (
            <form
              onSubmit={handleSearch}
              className="hidden max-w-sm flex-1 items-center md:flex"
            >
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-10"
                />
              </div>
            </form>
          ) : (
            <div className="hidden flex-1 md:block" />
          )}

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <Button
                  variant={activeView === "dashboard" ? "default" : "ghost"}
                  size="icon"
                  type="button"
                  className="hidden md:flex"
                  onClick={onOpenDashboard}
                >
                  <UserRound className="h-5 w-5" />
                </Button>

                {isAdmin && (
                  <Button
                    variant={activeView === "admin" ? "default" : "ghost"}
                    size="icon"
                    type="button"
                    className="hidden md:flex"
                    onClick={onOpenAdmin}
                  >
                    <ShieldCheck className="h-5 w-5" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="hidden md:flex"
                  onClick={onSignOut}
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                type="button"
                className="hidden md:inline-flex"
                onClick={onSignIn}
              >
                Sign In
              </Button>
            )}

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

        {mobileMenuOpen && (
          <div className="border-t py-4 lg:hidden">
            <nav className="flex flex-col gap-3">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="text-left text-sm font-medium transition-colors hover:text-pink-600"
                  onClick={() => handleNavigate(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {showSearch && (
              <form onSubmit={handleSearch} className="mt-4 md:hidden">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-10"
                  />
                </div>
              </form>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {isAuthenticated ? (
                <>
                  <Button type="button" variant="outline" onClick={onOpenDashboard}>
                    Dashboard
                  </Button>
                  {isAdmin && (
                    <Button type="button" variant="outline" onClick={onOpenAdmin}>
                      Admin
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={onSignOut}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <Button type="button" variant="outline" onClick={onSignIn}>
                  Sign In
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
