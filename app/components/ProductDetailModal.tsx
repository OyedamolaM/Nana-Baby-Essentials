"use client";

import { useEffect, useState } from "react";
import { Heart, Share2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { formatNaira } from "../../lib/commerce";
import { type Product } from "./ProductCard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";

interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity?: number) => void;
  addActionLabel?: string;
}

export function ProductDetailModal({
  product,
  open,
  onClose,
  onAddToCart,
  addActionLabel = "Add to Cart",
}: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!open || !product || !user || !hasSupabaseEnv) {
      return;
    }

    let isMounted = true;

    const loadWishlistState = async () => {
      const { data, error } = await supabase
        .from("wishlists")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", product.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (error) {
        setIsInWishlist(false);
        return;
      }

      setIsInWishlist(Boolean(data));
    };

    void loadWishlistState();

    return () => {
      isMounted = false;
    };
  }, [open, product, user]);

  if (!product) {
    return null;
  }

  const handleAddToCart = () => {
    onAddToCart(product, quantity);
    onClose();
  };

  const toggleWishlist = async () => {
    if (!user) {
      toast.error("Please sign in to add items to your wishlist.");
      return;
    }

    if (!hasSupabaseEnv) {
      toast.error("Supabase is not configured yet.");
      return;
    }

    setLoading(true);

    if (isInWishlist) {
      const { error } = await supabase
        .from("wishlists")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", product.id);

      if (error) {
        toast.error("Failed to remove from wishlist.");
      } else {
        setIsInWishlist(false);
        toast.success("Removed from wishlist.");
      }
    } else {
      const { error } = await supabase.from("wishlists").insert({
        user_id: user.id,
        product_id: product.id,
      });

      if (error) {
        toast.error("Failed to add to wishlist.");
      } else {
        setIsInWishlist(true);
        toast.success("Added to wishlist.");
      }
    }

    setLoading(false);
  };

  const handleShare = async () => {
    const shareUrl = new URL(window.location.href);
    shareUrl.hash = "products";

    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: product.description,
          url: shareUrl.toString(),
        });
      } catch {
        // Ignore cancelled shares.
      }
      return;
    }

    await navigator.clipboard.writeText(shareUrl.toString());
    toast.success("Link copied to clipboard.");
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <img
              src={product.image}
              alt={product.name}
              className="aspect-square w-full rounded-lg object-cover"
            />
          </div>

          <div className="space-y-6">
            <div>
              <Badge variant="secondary" className="mb-2">
                {product.category}
              </Badge>
              <h2 className="mb-2 text-3xl font-bold text-gray-900">
                {product.name}
              </h2>
              <p className="text-3xl font-bold text-pink-600">
                {formatNaira(product.price)}
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-gray-900">Description</h3>
              <p className="leading-relaxed text-gray-600">
                {product.description}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="font-semibold">Quantity:</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  >
                    -
                  </Button>
                  <span className="w-12 text-center">{quantity}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuantity((current) => current + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  className="flex-1"
                  onClick={handleAddToCart}
                  disabled={!product.inStock}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {product.inStock ? addActionLabel : "Out of Stock"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={toggleWishlist}
                  disabled={loading}
                >
                  <Heart
                    className={`h-5 w-5 ${isInWishlist ? "fill-red-500 text-red-500" : ""}`}
                  />
                </Button>

                <Button type="button" variant="outline" size="icon" onClick={handleShare}>
                  <Share2 className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">SKU:</span>
                <span className="font-semibold">
                  BB-{product.id.toString().padStart(6, "0")}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Availability:</span>
                <span className={product.inStock ? "text-green-600" : "text-red-600"}>
                  {product.inStock ? "In Stock" : "Out of Stock"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Category:</span>
                <span className="font-semibold">{product.category}</span>
              </div>
            </div>

            <div className="rounded-lg bg-pink-50 p-4">
              <h4 className="mb-2 font-semibold text-gray-900">
                Shipping Information
              </h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>- Free shipping on orders above N50,000</li>
                <li>- Delivery within 2-5 days in Lagos</li>
                <li>- 3-7 days for other locations</li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
