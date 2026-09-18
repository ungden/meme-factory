import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";


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
