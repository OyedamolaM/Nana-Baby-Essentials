"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Menu, Search, User } from "lucide-react";
import { toast } from "sonner";
import { usePublishedBlogPosts } from "../hooks/useContentData";
import { type BlogPostSummary } from "../../lib/content";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";

function formatPublishedDate(value?: string | null) {
  if (!value) {
    return "Draft";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });
}

interface BlogPageProps {
  initialPosts?: BlogPostSummary[];
}

export function BlogPage({ initialPosts }: BlogPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const { loading, posts } = usePublishedBlogPosts(initialPosts);

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

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const query = searchQuery.toLowerCase();
      return (
        post.title.toLowerCase().includes(query) ||
        post.excerpt.toLowerCase().includes(query) ||
        post.category.toLowerCase().includes(query)
      );
    });
  }, [posts, searchQuery]);

  const handleSubscribe = async () => {
    if (!newsletterEmail.trim()) {
      toast.error("Enter your email to subscribe.");
      return;
    }

    setNewsletterSubmitting(true);

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: newsletterEmail,
          source: "Blog Page",
        }),
      });

      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        toast.error(result.message ?? "Could not subscribe right now.");
        return;
      }

      toast.success(result.message ?? "Thanks for subscribing to Nana's newsletter!");
      setNewsletterEmail("");
    } catch (error) {
      console.error("Failed to subscribe to newsletter.", error);
      toast.error("Could not subscribe right now.");
    } finally {
      setNewsletterSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header
        ref={headerRef}
        className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur"
      >
        <div className="relative container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-left">
              <img
                src="/logo.jpg"
                alt="Nana's Baby Blog logo"
                className="h-7 w-7 shrink-0 sm:h-8 sm:w-8"
              />
              <div className="flex flex-col leading-tight">
                <p className="font-serif text-sm font-medium italic leading-tight tracking-tight text-[#7c3a67] sm:text-xl">
                  Nana&apos;s Baby
                </p>
                <p className="font-serif text-xs font-medium italic leading-tight tracking-tight text-[#9a5d84] sm:text-base">
                  Blog
                </p>
              </div>
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

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          {mobileMenuOpen && (
            <div className="absolute inset-x-0 top-full z-50 border-t bg-white px-4 py-4 shadow-xl md:hidden">
              <nav className="flex flex-col gap-3">
                <Link
                  href="/"
                  className="text-sm font-normal transition-colors hover:text-pink-600"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Home
                </Link>
                <Link
                  href="/registry"
                  className="text-sm font-normal transition-colors hover:text-pink-600"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Baby Registry
                </Link>
                <a
                  href="#all-posts"
                  className="text-sm font-normal transition-colors hover:text-pink-600"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  All Posts
                </a>
              </nav>
            </div>
          )}
        </div>
      </header>

      <section className="bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 pt-12 pb-6 sm:pt-18 sm:pb-10">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-[30px] font-medium leading-tight tracking-tight text-neutral-900 sm:text-5xl lg:text-[48px]">
              Parenting Tips &{" "}
              <span className="brand-script">
                Baby Care
              </span>
            </h1>
            <p className="mb-8 text-[14px] leading-relaxed text-gray-600 sm:text-base lg:text-lg">
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

      <section id="all-posts" className="pt-8 pb-16 sm:pt-10 sm:pb-20">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="py-16 text-center">
              <p className="text-xl text-gray-500">Loading posts...</p>
            </div>
          ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`}>
                <Card className="overflow-hidden transition-shadow hover:shadow-lg">
                  {post.cover_image ? (
                    <ImageWithFallback
                      src={post.cover_image}
                      alt={post.title}
                      className="h-48 w-full object-cover"
                    />
                  ) : null}
                  <CardContent className="p-6">
                    <Badge variant="secondary" className="mb-3">
                      {post.category}
                    </Badge>

                    <h3 className="mb-2 line-clamp-2 text-xl font-medium tracking-tight text-neutral-900">
                      {post.title}
                    </h3>

                    <p className="mb-4 line-clamp-3 text-gray-600">
                      {post.excerpt}
                    </p>

                    <div className="flex items-center justify-between gap-3 text-sm text-gray-500">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          <span>{post.author_name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{formatPublishedDate(post.published_at)}</span>
                        </div>
                      </div>
                      <span className="text-pink-600">Read now</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          )}

          {!loading && filteredPosts.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-xl text-gray-500">
                No blog posts found. Try a different search.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-gradient-to-r from-pink-500 to-purple-600 pt-16 pb-12 text-white sm:py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-[28px] font-medium leading-tight tracking-tight md:text-[36px]">
            Subscribe to Our Newsletter
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-[13px] leading-relaxed text-white/90 md:text-lg">
            Get the latest parenting tips, product recommendations, and
            exclusive offers delivered to your inbox.
          </p>
          <form
            className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubscribe();
            }}
          >
            <Input
              type="email"
              placeholder="Enter your email"
              value={newsletterEmail}
              onChange={(event) => setNewsletterEmail(event.target.value)}
              className="bg-white text-gray-900"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={newsletterSubmitting}
            >
              {newsletterSubmitting ? "Subscribing..." : "Subscribe"}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
