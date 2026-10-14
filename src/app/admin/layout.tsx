import { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import AdminSidebar from "@/components/admin/admin-sidebar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: { absolute: "Quản trị | AIDA" } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Check authentication
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check admin role using service role client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!roleData || roleData.role !== "admin") {
    redirect("/projects");
  }

  return (
    // Thanh bên dựng một lần ở đây như AppShell của phần chủ kênh: mỗi trang tự
    // dựng thì lệch lề và chớp lại mỗi lần chuyển trang.
    <div className="min-h-screen th-bg-primary">
      <AdminSidebar />
      <div className="min-h-screen lg:pl-60">{children}</div>
    </div>
  );
}
