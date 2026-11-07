import type { MetadataRoute } from "next";

// A private workspace: nothing here is meant to be crawled.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
