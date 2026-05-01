"use client";

import { useState, useRef } from "react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { ProductShowcase } from "./components/ProductShowcase";
import { BabyRegistryHighlight } from "./components/BabyRegistryHighlight";
import { About } from "./components/About";
import { FAQ } from "./components/FAQ";
import { Footer } from "./components/Footer";
import { ProductCard, Product } from "./components/ProductCard";
import { CategoryFilter } from "./components/CategoryFilter";
import { ShoppingCartDrawer } from "./components/ShoppingCartDrawer";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";

const PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Soft Plush Teddy Bear",
    price: 24.99,
    category: "Toys",
    image: "https://images.unsplash.com/photo-1684577753340-de97c66fa6fd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OHww&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Ultra-soft and cuddly teddy bear, perfect for bedtime snuggles",
    inStock: true,
  },
  {
    id: 2,
    name: "Organic Cotton Onesie",
    price: 18.99,
    category: "Clothing",
    image: "https://images.unsplash.com/photo-1622290291165-d341f1938b8a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "100% organic cotton onesie, gentle on baby's sensitive skin",
    inStock: true,
  },
  {
    id: 3,
    name: "Colorful Building Blocks",
    price: 29.99,
    category: "Toys",
    image: "https://images.unsplash.com/photo-1655087751207-1020c89f7eee?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw5fHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OXww&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Safe, colorful blocks for developing motor skills and creativity",
    inStock: true,
  },
  {
    id: 4,
    name: "Rainbow Baby Dresses",
    price: 34.99,
    category: "Clothing",
    image: "https://images.unsplash.com/photo-1560506840-ec148e82a604?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Beautiful collection of colorful dresses for special occasions",
    inStock: true,
  },
  {
    id: 5,
    name: "Baby Blue Romper",
    price: 22.99,
    category: "Clothing",
    image: "https://images.unsplash.com/photo-1622290319146-7b63df48a635?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Comfortable and stylish blue romper for everyday wear",
    inStock: true,
  },
  {
    id: 6,
    name: "Colorful Baby Socks Set",
    price: 12.99,
    category: "Accessories",
    image: "https://images.unsplash.com/photo-1542355581-caf7454785ca?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw0fHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Pack of 5 adorable colorful socks to keep tiny feet warm",
    inStock: true,
  },
  {
    id: 7,
    name: "Activity Play Mat",
    price: 49.99,
    category: "Toys",
    image: "https://images.unsplash.com/photo-1593793373220-2e51e1c31385?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw2fHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OXww&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Interactive play mat with textures and colors for sensory development",
    inStock: true,
  },
  {
    id: 8,
    name: "Stuffed Animal Collection",
    price: 39.99,
    category: "Toys",
    image: "https://images.unsplash.com/photo-1724703171978-bbe9c2ab70c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw3fHxiYWJ5JTIwcHJvZHVjdHMlMjB0b3lzfGVufDF8fHx8MTc3NzUzMDQ5OXww&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Set of adorable stuffed animals for imaginative play",
    inStock: true,
  },
  {
    id: 9,
    name: "White Dress & Shoes Set",
    price: 44.99,
    category: "Clothing",
    image: "https://images.unsplash.com/photo-1684244160171-97f5dac39204?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw3fHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Elegant white dress with matching shoes for special events",
    inStock: false,
  },
  {
    id: 10,
    name: "Colorful Onesie Pack",
    price: 32.99,
    category: "Clothing",
    image: "https://images.unsplash.com/photo-1569974641446-22542de88536?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw4fHxiYWJ5JTIwY2xvdGhlc3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Set of 3 colorful onesies for everyday comfort",
    inStock: true,
  },
  {
    id: 11,
    name: "Baby Gift Hamper",
    price: 89.99,
    category: "Accessories",
    image: "https://images.unsplash.com/photo-1635874714425-c342060a4c58?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxMHx8YmFieSUyMGNsb3RoZXN8ZW58MXx8fHwxNzc3NTMwNDk5fDA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Complete gift set with essentials for new parents",
    inStock: true,
  },
  {
    id: 12,
    name: "Educational Toy Set",
    price: 36.99,
    category: "Toys",
    image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxMHx8YmFieSUyMHByb2R1Y3RzJTIwdG95c3xlbnwxfHx8fDE3Nzc1MzA0OTl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    description: "Age-appropriate educational toys for early learning",
    inStock: true,
  },
];

const CATEGORIES = ["All", "Toys", "Clothing", "Accessories"];

interface CartItem extends Product {
  quantity: number;
}

export default function App() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const productsRef = useRef<HTMLElement>(null);

  const filteredProducts = PRODUCTS.filter(p => {
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    const matchesSearch = searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleAddToCart = (product: Product) => {
    setCartItems(prev => {
      const existingItem = prev.find(item => item.id === product.id);
      if (existingItem) {
        toast.success(`Added another ${product.name} to cart`);
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      toast.success(`${product.name} added to cart`);
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const handleRemoveItem = (productId: number) => {
    setCartItems(prev => prev.filter(item => item.id !== productId));
    toast.info("Item removed from cart");
  };

  const handleUpdateQuantity = (productId: number, quantity: number) => {
    setCartItems(prev =>
      prev.map(item =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const totalCartItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const scrollToProducts = () => {
    productsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    scrollToProducts();
  };

  return (
    <div className="min-h-screen bg-white">
      <Header
        cartItemCount={totalCartItems}
        onCartClick={() => setCartOpen(true)}
        onSearch={handleSearch}
      />

      <main>
        <section id="home">
          <Hero onShopNow={scrollToProducts} />
        </section>

        <ProductShowcase
          products={PRODUCTS}
          onAddToCart={handleAddToCart}
          onViewAll={scrollToProducts}
        />

        <section id="registry">
          <BabyRegistryHighlight />
        </section>

        <section id="about">
          <About />
        </section>

        <section id="products" ref={productsRef} className="py-20 bg-gradient-to-b from-white to-gray-50">
          <div className="container mx-auto px-4">
            <div className="mb-8 text-center">
              <h2 className="text-4xl font-bold text-gray-900 mb-2">
                {searchQuery ? `Search Results for "${searchQuery}"` : "All Products"}
              </h2>
              <p className="text-gray-600">
                {searchQuery ? `${filteredProducts.length} products found` : "Browse our complete collection"}
              </p>
            </div>

            <CategoryFilter
              categories={CATEGORIES}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />

            {filteredProducts.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-xl text-gray-500">No products found. Try a different search or category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={handleAddToCart}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="faq">
          <FAQ />
        </section>
      </main>

      <Footer />

      <ShoppingCartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cartItems}
        onRemoveItem={handleRemoveItem}
        onUpdateQuantity={handleUpdateQuantity}
      />

      <Toaster />
    </div>
  );
}