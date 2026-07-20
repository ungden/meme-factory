import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminClient) return supabaseAdminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin chưa được cấu hình");
  }

  supabaseAdminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supabaseAdminClient;
}

// Preserve the existing route API while deferring client creation until a
// request actually touches Supabase. This keeps local builds and UI previews
// working without production secrets.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * Verify user token and check admin role.
 * Returns user object if admin, throws error otherwise.
 */
export async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new AdminError("Chưa đăng nhập", 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    throw new AdminError("Phiên đăng nhập hết hạn", 401);
  }

  // Check admin role
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!role || role.role !== "admin") {
    throw new AdminError("Bạn không có quyền truy cập", 403);
  }

  return user;
}

export class AdminError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
