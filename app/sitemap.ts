import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    { url: "https://tangzihang.top", lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  ];
}
