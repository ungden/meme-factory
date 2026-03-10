"use client";

import { useState, useEffect, useCallback } from "react";
import AdminSidebar from "@/components/admin/admin-sidebar";
import { createClient } from "@/lib/supabase/client";
import { Search, ChevronLeft, ChevronRight, Shield, User, UserCog } from "lucide-react";
import Link from "next/link";

interface UserRow {
  user_id: string;
  email: string;
  role: string;
  balance: number;
  points: number;
  projects_count: number;
  memes_count: number;
  created_at: string;
}

function formatVND(amount: number) {
  return amount.toLocaleString("vi-VN") + "đ";
}

const ROLE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  admin: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Admin" },
  moderator: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Mod" },
  user: { bg: "rgba(107,114,128,0.15)", color: "#6b7280", label: "User" },
};

const ROLE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  admin: Shield,
  moderator: UserCog,
  user: User,
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(data.users);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Quản lý người dùng</h1>
            <p className="th-text-tertiary mt-1">{total} người dùng</p>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 th-text-muted" />
            <input
              type="text"
              placeholder="Tìm theo email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm th-bg-card th-text-primary th-border"
              style={{ border: "1px solid var(--border-primary)" }}
            />
          </div>
        </form>

        {/* Table */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--bg-tertiary)" }}>
                  <th className="text-left py-3 px-4 text-xs font-medium th-text-muted uppercase tracking-wider">Email</th>
                  <th className="text-left py-3 px-4 text-xs font-medium th-text-muted uppercase tracking-wider">Role</th>
                  <th className="text-right py-3 px-4 text-xs font-medium th-text-muted uppercase tracking-wider">Points</th>
                  <th className="text-right py-3 px-4 text-xs font-medium th-text-muted uppercase tracking-wider">Số dư</th>
                  <th className="text-right py-3 px-4 text-xs font-medium th-text-muted uppercase tracking-wider">Dự án</th>
                  <th className="text-right py-3 px-4 text-xs font-medium th-text-muted uppercase tracking-wider">Memes</th>
                  <th className="text-left py-3 px-4 text-xs font-medium th-text-muted uppercase tracking-wider">Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="py-4 px-4">
                        <div className="h-5 th-bg-tertiary rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center th-text-muted">
                      Không tìm thấy người dùng
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const roleStyle = ROLE_STYLES[u.role] || ROLE_STYLES.user;
                    const RoleIcon = ROLE_ICONS[u.role] || User;
                    return (
                      <tr key={u.user_id} className="border-t th-bg-hover" style={{ borderColor: "var(--border-primary)" }}>
                        <td className="py-3 px-4">
                          <Link href={`/admin/users/${u.user_id}`} className="th-text-accent hover:underline font-medium">
                            {u.email}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: roleStyle.bg, color: roleStyle.color }}>
                            <RoleIcon size={12} />
                            {roleStyle.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium th-text-primary">{u.points}</td>
                        <td className="py-3 px-4 text-right th-text-secondary">{formatVND(u.balance)}</td>
                        <td className="py-3 px-4 text-right th-text-secondary">{u.projects_count}</td>
                        <td className="py-3 px-4 text-right th-text-secondary">{u.memes_count}</td>
                        <td className="py-3 px-4 th-text-muted text-xs">
                          {new Date(u.created_at).toLocaleDateString("vi-VN")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border-primary)" }}>
              <span className="text-xs th-text-muted">Trang {page}/{totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg th-bg-hover disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg th-bg-hover disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
