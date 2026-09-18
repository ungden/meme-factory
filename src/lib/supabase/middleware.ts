import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isValidUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth callback — let its Route Handler manage cookies & redirect directly
  if (pathname.startsWith("/api/auth/callback")) {
    return NextResponse.next();
  }

  // Những route này xác thực bằng token trong header, không bao giờ đọc cookie
  // phiên. Làm mới phiên cho chúng chỉ thêm một lượt gọi mạng tới Supabase cho
  // mỗi nhịp của worker — vài nghìn lượt mỗi ngày, không đổi lại điều gì.
  if (
    pathname.startsWith("/api/internal/") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname === "/api/health"
  ) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Thiếu cấu hình Supabase thì không thể biết ai đang gọi. Ở môi trường phát
  // triển, cho qua để còn dựng giao diện; ở production, cho qua nghĩa là mở
  // toang mọi trang sau đăng nhập, nên trả 503 và dừng hẳn.
  if (!isValidUrl(supabaseUrl) || !supabaseKey) {
    if (process.env.NODE_ENV === "production")
      return new NextResponse(
        JSON.stringify({ error: "Hệ thống chưa cấu hình xong. Vui lòng thử lại sau." }),
        { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } },
      );
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect to login if not authenticated and trying to access dashboard
  // Skip redirect for API routes (they handle auth themselves via Bearer token or API key)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    !request.nextUrl.pathname.startsWith("/privacy") &&
    !request.nextUrl.pathname.startsWith("/terms") &&
    !request.nextUrl.pathname.startsWith("/pricing") &&
    !request.nextUrl.pathname.startsWith("/help") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  }

  // Redirect to dashboard if authenticated and on login page
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      url.pathname = next;
      url.search = "";
    } else {
      url.pathname = "/projects";
      url.search = "";
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
