import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // `.txt` và `.xml` nằm trong danh sách này vì robots.txt và sitemap.xml từng
    // bị proxy đẩy về /login: công cụ tìm kiếm nhận 307 thay vì nội dung.
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml|woff|woff2|ttf|otf)$).*)",
  ],
};
