"use client";

import { useState, useEffect, useCallback } from "react";
import AdminSidebar from "@/components/admin/admin-sidebar";
import { createClient } from "@/lib/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface AILog {
  id: string;
  actor_user_id: string;
  user_email: string;
  amount: number;
  type: string;
  ai_type: string;
  project_name: string;
  output_kind?: string | null;
  output_id?: string | null;
  output_url?: string | null;
  output_title?: string | null;
  description: string;
  status: string;
  created_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const AI_TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  character: { bg: "rgba(99,102,241,0.15)", color: "#6366f1", label: "Nhân vật" },
  meme: { bg: "rgba(236,72,153,0.15)", color: "#ec4899", label: "Meme" },
  background: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Background" },
  refund: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Hoàn trả" },
  other: { bg: "rgba(107,114,128,0.15)", color: "#6b7280", label: "Khác" },
};

export default function AdminAILogsPage() {
  const [logs, setLogs] = useState<AILog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const params = new URLSearchParams({ page: String(page) });
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/admin/ai-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold th-text-primary">AI Generation Logs</h1>
          <p className="th-text-tertiary mt-1">{total} lượt tạo ảnh AI</p>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { value: "", label: "Tất cả" },
            { value: "character", label: "Nhân vật" },
            { value: "meme", label: "Meme" },
            { value: "background", label: "Background" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => { setTypeFilter(f.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                typeFilter === f.value ? "th-bg-accent-light th-text-accent" : "th-bg-tertiary th-text-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--bg-tertiary)" }}>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Thời gian</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Email</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Dự án</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Loại</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Output</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Mô tả</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Trạng thái</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium th-text-muted uppercase">Points</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="py-4 px-4"><div className="h-5 th-bg-tertiary rounded animate-pulse" /></td></tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center th-text-muted">Chưa có log AI generation</td></tr>
                ) : (
                  logs.map((log) => {
                    const style = AI_TYPE_STYLES[log.ai_type] || AI_TYPE_STYLES.other;
                    return (
                      <tr key={log.id} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                        <td className="py-2.5 px-4 th-text-muted text-xs whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="py-2.5 px-4 th-text-primary text-xs truncate max-w-[160px]">{log.user_email}</td>
                        <td className="py-2.5 px-4 th-text-secondary text-xs truncate max-w-[160px]">{log.project_name}</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: style.bg, color: style.color }}>
                            {style.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 th-text-secondary text-xs">
                          {log.output_kind === "meme" ? (
                            <div className="max-w-[220px]">
                              <p className="truncate">{log.output_title || "Meme"}</p>
                              {log.output_url ? (
                                <a href={log.output_url} target="_blank" rel="noreferrer" className="th-text-accent underline">
                                  Xem output
                                </a>
                              ) : (
                                <span className="th-text-muted">Không có URL</span>
                              )}
                            </div>
                          ) : log.output_kind ? (
                            <span>{log.output_kind}</span>
                          ) : (
                            <span className="th-text-muted">Chưa gắn output</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 th-text-secondary text-xs truncate max-w-[250px]">{log.description}</td>
                        <td className="py-2.5 px-4 text-xs" style={{ color: log.status === "completed" ? "#22c55e" : log.status === "failed" ? "#ef4444" : "#f59e0b" }}>
                          {log.status === "completed" ? "Thành công" : log.status === "failed" ? "Thất bại" : "Đang xử lý"}
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium" style={{ color: Number(log.amount) >= 0 ? "#22c55e" : "#ef4444" }}>
                          {Math.abs(Number(log.amount))} pts
                        </td>
                      </tr>
                    );
                  })
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
