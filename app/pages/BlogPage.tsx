"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Baby, Calendar, Search, User } from "lucide-react";
import { toast } from "sonner";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";

const blogPosts = [
  {
    id: 1,
    title: "10 Must-Have Items for Your Baby Registry",
    excerpt:
      "Creating a baby registry can be overwhelming. Here are the essential items every new parent needs to include.",
    category: "Registry Tips",
    author: "Sarah Johnson",
    date: "April 28, 2026",
    image:
      "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800",
    readTime: "5 min read",
  },
  {
    id: 2,
    title: "Preparing Your Nursery: A Complete Guide",
    excerpt:
      "Transform your spare room into the perfect nursery for your little one with our step-by-step guide.",
    category: "Nursery",
    author: "Michael Chen",
    date: "April 25, 2026",
    image:
      "https://images.unsplash.com/photo-1522771930-78848d9293e8?w=800",
    readTime: "7 min read",
  },
  {
    id: 3,
    title: "The Benefits of Organic Cotton for Baby Clothes",
    excerpt:
      "Learn why organic cotton is the best choice for your baby's sensitive skin and how to identify quality products.",
    category: "Baby Care",
    author: "Dr. Ada Okafor",
    date: "April 20, 2026",
    image:
      "https://images.unsplash.com/photo-1622290291165-d341f1938b8a?w=800",
    readTime: "4 min read",
  },
  {
    id: 4,
    title: "How to Choose the Right Baby Toys by Age",
    excerpt:
      "From newborns to toddlers, discover the perfect developmental toys for every stage of your baby's growth.",
    category: "Development",
    author: "Sarah Johnson",
    date: "April 18, 2026",
    image:
      "https://images.unsplash.com/photo-1655087751207-1020c89f7eee?w=800",
    readTime: "6 min read",
  },
  {
    id: 5,
    title: "First-Time Parent's Guide to Baby Sleep",
    excerpt:
      "Understanding your baby's sleep patterns and creating healthy sleep habits from day one.",
    category: "Baby Care",
    author: "Dr. Chioma Nwosu",
    date: "April 15, 2026",
    image:
      "https://images.unsplash.com/photo-1593793373220-2e51e1c31385?w=800",
    readTime: "8 min read",
  },
  {
    id: 6,
    title: "Baby Registry Do's and Don'ts",
    excerpt:
      "Avoid common registry mistakes and make sure you get everything you need with these expert tips.",
    category: "Registry Tips",
    author: "Michael Chen",
    date: "April 12, 2026",
    image:
      "https://images.unsplash.com/photo-1724703171978-bbe9c2ab70c4?w=800",
    readTime: "5 min read",
  },
];

export function BlogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");

  const filteredPosts = useMemo(() => {
    return blogPosts.filter((post) => {
      const query = searchQuery.toLowerCase();
      return (
        post.title.toLowerCase().includes(query) ||
        post.excerpt.toLowerCase().includes(query) ||
        post.category.toLowerCase().includes(query)
      );
    });
  }, [searchQuery]);

  const handleSubscribe = () => {
    if (!newsletterEmail.trim()) {
      toast.error("Enter your email to subscribe.");
      return;
    }

    toast.success("Thanks for subscribing to Nana's newsletter!");
    setNewsletterEmail("");
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Baby className="h-8 w-8 text-pink-500" />
              <h1 className="text-2xl font-semibold text-gray-900">
                Nana&apos;s Blog
              </h1>
            </Link>

            <nav className="hidden items-center gap-6 md:flex">
              <Link
                href="/"
                className="text-sm font-medium transition-colors hover:text-pink-600"
              >
                Home
              </Link>
              <Link
                href="/registry"
                className="text-sm font-medium transition-colors hover:text-pink-600"
              >
                Baby Registry
              </Link>
              <a
                href="#all-posts"
                className="text-sm font-medium transition-colors hover:text-pink-600"
              >
                All Posts
              </a>
            </nav>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-5xl font-bold text-gray-900 md:text-6xl">
              Parenting Tips & Baby Care
            </h1>
            <p className="mb-8 text-xl text-gray-600">
              Expert advice, helpful guides, and everything you need to know
              about caring for your little one.
            </p>

            <div className="mx-auto max-w-xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="py-6 pl-12 text-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="all-posts" className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <Card
                key={post.id}
                className="cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
              >
                <ImageWithFallback
                  src={post.image}
                  alt={post.title}
                  className="h-48 w-full object-cover"
                />
                <CardContent className="p-6">
                  <Badge variant="secondary" className="mb-3">
                    {post.category}
                  </Badge>

                  <h3 className="mb-2 line-clamp-2 text-xl font-bold text-gray-900">
                    {post.title}
                  </h3>

                  <p className="mb-4 line-clamp-3 text-gray-600">
                    {post.excerpt}
                  </p>

                  <div className="flex items-center justify-between gap-3 text-sm text-gray-500">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        <span>{post.author}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{post.date}</span>
                      </div>
                    </div>
                    <span className="text-pink-600">{post.readTime}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredPosts.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-xl text-gray-500">
                No blog posts found. Try a different search.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-gradient-to-r from-pink-500 to-purple-600 py-20 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-4xl font-bold">
            Subscribe to Our Newsletter
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-xl">
            Get the latest parenting tips, product recommendations, and
            exclusive offers delivered to your inbox.
          </p>
          <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              placeholder="Enter your email"
              value={newsletterEmail}
              onChange={(event) => setNewsletterEmail(event.target.value)}
              className="bg-white text-gray-900"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleSubscribe}
            >
              Subscribe
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
