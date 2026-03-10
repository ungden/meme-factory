"use client";

import { useState, useEffect, useCallback } from "react";
import AdminSidebar from "@/components/admin/admin-sidebar";
import { createClient } from "@/lib/supabase/client";
import { Search, ChevronLeft, ChevronRight, Users, Image } from "lucide-react";

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  user_id: string;
  user_email: string;
  characters_count: number;
  memes_count: number;
  created_at: string;
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/projects?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setProjects(data.projects ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProjects();
  };

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Quản lý dự án</h1>
            <p className="th-text-tertiary mt-1">{total} dự án</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 th-text-muted" />
            <input
              type="text"
              placeholder="Tìm theo tên dự án..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm th-bg-card th-text-primary"
              style={{ border: "1px solid var(--border-primary)" }}
            />
          </div>
        </form>

        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--bg-tertiary)" }}>
                  <th className="text-left py-3 px-4 text-xs font-medium th-text-muted uppercase">Tên dự án</th>
                  <th className="text-left py-3 px-4 text-xs font-medium th-text-muted uppercase">Chủ sở hữu</th>
                  <th className="text-center py-3 px-4 text-xs font-medium th-text-muted uppercase">Nhân vật</th>
                  <th className="text-center py-3 px-4 text-xs font-medium th-text-muted uppercase">Memes</th>
                  <th className="text-left py-3 px-4 text-xs font-medium th-text-muted uppercase">Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="py-4 px-4"><div className="h-5 th-bg-tertiary rounded animate-pulse" /></td></tr>
                  ))
                ) : projects.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center th-text-muted">Không có dự án</td></tr>
                ) : (
                  projects.map((p) => (
                    <tr key={p.id} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                      <td className="py-3 px-4">
                        <p className="font-medium th-text-primary">{p.name}</p>
                        {p.description && <p className="text-xs th-text-muted truncate max-w-[200px]">{p.description}</p>}
                      </td>
                      <td className="py-3 px-4 th-text-secondary text-xs">{p.user_email}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-xs th-text-secondary">
                          <Users size={12} /> {p.characters_count}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-xs th-text-secondary">
                          <Image size={12} /> {p.memes_count}
                        </span>
                      </td>
                      <td className="py-3 px-4 th-text-muted text-xs">{new Date(p.created_at).toLocaleDateString("vi-VN")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border-primary)" }}>
              <span className="text-xs th-text-muted">Trang {page}/{totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg th-bg-hover disabled:opacity-30"><ChevronLeft size={16} /></button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg th-bg-hover disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
