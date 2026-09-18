import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://aida.vn";

/**
 * robots.txt sinh theo tên miền thật.
 *
 * File tĩnh cũ vẫn trỏ về `meme-factory-bice.vercel.app` — tên miền của bản
 * thử nghiệm đầu tiên — nên sitemap khai báo cho công cụ tìm kiếm chỉ về một
 * chỗ không còn là sản phẩm.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/projects/", "/admin/", "/login", "/settings", "/wallet", "/onboarding"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
