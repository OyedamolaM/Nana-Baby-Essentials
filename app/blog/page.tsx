import { Footer } from "../components/Footer";
import { BlogPage } from "../pages/BlogPage";
import { getPublishedBlogPosts } from "../../lib/publicData";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Parenting Blog",
  description:
    "Read baby care advice, registry tips, nursery ideas, and product guides from Nana's Baby Essentials.",
  path: "/blog",
});

export default async function BlogRoutePage() {
  const initialPosts = await getPublishedBlogPosts();

  return (
    <>
      <BlogPage initialPosts={initialPosts} />
      <Footer />
    </>
  );
}
