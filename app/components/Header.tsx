'use client'

import { ShoppingCart, Baby, Search, Menu, Heart } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { useState } from "react";

interface HeaderProps {
  cartItemCount: number;
  onCartClick: () => void;
  onSearch: (query: string) => void;
}

export function Header({ cartItemCount, onCartClick, onSearch }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Baby className="h-8 w-8 text-pink-500" />
            <h1 className="text-2xl font-semibold text-gray-900">Nana&apos;s Baby Essentials</h1>
          </div>

          <nav className="hidden lg:flex items-center gap-6">
            <a href="#home" className="text-sm font-medium hover:text-pink-600 transition-colors">Home</a>
            <a href="#products" className="text-sm font-medium hover:text-pink-600 transition-colors">Products</a>
            <a href="#registry" className="text-sm font-medium hover:text-pink-600 transition-colors">Registry</a>
            <a href="#about" className="text-sm font-medium hover:text-pink-600 transition-colors">About</a>
            <a href="#faq" className="text-sm font-medium hover:text-pink-600 transition-colors">FAQ</a>
          </nav>

          <form onSubmit={handleSearch} className="hidden md:flex items-center flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </form>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex"
            >
              <Heart className="h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="relative"
              onClick={onCartClick}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -right-2 -top-2 h-5 min-w-5 rounded-full p-0 flex items-center justify-center"
                >
                  {cartItemCount}
                </Badge>
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t">
            <nav className="flex flex-col gap-4">
              <a href="#home" className="text-sm font-medium hover:text-pink-600 transition-colors">Home</a>
              <a href="#products" className="text-sm font-medium hover:text-pink-600 transition-colors">Products</a>
              <a href="#registry" className="text-sm font-medium hover:text-pink-600 transition-colors">Registry</a>
              <a href="#about" className="text-sm font-medium hover:text-pink-600 transition-colors">About</a>
              <a href="#faq" className="text-sm font-medium hover:text-pink-600 transition-colors">FAQ</a>
            </nav>
            <form onSubmit={handleSearch} className="mt-4 md:hidden">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
