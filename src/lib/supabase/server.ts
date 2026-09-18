import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fallback for unconfigured environments — chỉ chấp nhận ngoài production.
  // Trên production, một client trỏ vào placeholder sẽ lặng lẽ trả "không có
  // dữ liệu" thay vì báo hỏng, và người dùng thấy một tài khoản trống rỗng.
  const configured = Boolean(url && url.startsWith("http") && key);
  if (!configured && process.env.NODE_ENV === "production")
    throw new Error("Supabase chưa được cấu hình trên môi trường này.");
  const supabaseUrl = url && url.startsWith("http") ? url : "https://placeholder.supabase.co";
  const supabaseKey = key || "placeholder-key";

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
