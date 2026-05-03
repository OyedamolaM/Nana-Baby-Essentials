"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Baby, Calendar, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Footer } from "../../components/Footer";
import { ImageWithFallback } from "../../components/figma/ImageWithFallback";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { usePublishedBlogPosts } from "../../hooks/useContentData";

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
    year: "numeric",
  });
}

export default function BlogArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { loading, postLookup } = usePublishedBlogPosts();

  const post = useMemo(() => postLookup[slug], [postLookup, slug]);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Baby className="h-8 w-8 text-pink-500" />
            <span className="text-xl font-semibold text-gray-900 md:text-2xl">
              Nana&apos;s Blog
            </span>
          </Link>
          <Button asChild variant="outline">
            <Link href="/blog">Back to Blog</Link>
          </Button>
        </div>
      </header>

      <main className="bg-gradient-to-br from-pink-50 via-white to-blue-50 py-16">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="mx-auto max-w-3xl rounded-3xl border bg-white p-10 text-center text-gray-500 shadow-sm">
              Loading article...
            </div>
          ) : !post ? (
            <div className="mx-auto max-w-3xl rounded-3xl border bg-white p-10 text-center shadow-sm">
              <h1 className="text-3xl font-bold text-gray-900">
                Article not found
              </h1>
              <p className="mt-3 text-gray-600">
                This blog post may have been unpublished or the link may be incorrect.
              </p>
              <Button asChild className="mt-6">
                <Link href="/blog">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Browse all posts
                </Link>
              </Button>
            </div>
          ) : (
            <article className="mx-auto max-w-4xl overflow-hidden rounded-[32px] border bg-white shadow-xl">
              {post.cover_image ? (
                <ImageWithFallback
                  src={post.cover_image}
                  alt={post.title}
                  className="h-72 w-full object-cover md:h-[420px]"
                />
              ) : null}

              <div className="p-8 md:p-12">
                <Badge variant="secondary">{post.category}</Badge>
                <h1 className="mt-4 text-4xl font-bold leading-tight text-gray-900 md:text-5xl">
                  {post.title}
                </h1>
                <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                  <span className="inline-flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {post.author_name}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatPublishedDate(post.published_at)}
                  </span>
                </div>

                <div className="prose prose-gray mt-8 max-w-none prose-headings:text-gray-900 prose-a:text-pink-600">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {post.body_markdown}
                  </ReactMarkdown>
                </div>
              </div>
            </article>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
