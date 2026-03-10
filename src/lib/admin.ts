import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export { supabaseAdmin };

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
