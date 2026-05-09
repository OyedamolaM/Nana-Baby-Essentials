import type { MetadataRoute } from "next";

import { getSiteUrl } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/products", "/blog", "/registry"],
        disallow: ["/admin", "/dashboard", "/complete-profile"],
      },
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
