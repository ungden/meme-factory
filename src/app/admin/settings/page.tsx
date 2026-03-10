"use client";

import { useState, useEffect, useCallback } from "react";
import AdminSidebar from "@/components/admin/admin-sidebar";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Save, Plus, Trash2, Eye, EyeOff, Bell, Coins } from "lucide-react";
import { POINT_COSTS, POINT_PACKAGES } from "@/lib/point-pricing";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
  created_at: string;
}

const ANNOUNCEMENT_TYPES = [
  { value: "info", label: "Thông tin", color: "#3b82f6" },
  { value: "warning", label: "Cảnh báo", color: "#f59e0b" },
  { value: "success", label: "Thành công", color: "#22c55e" },
  { value: "promo", label: "Khuyến mãi", color: "#ec4899" },
];

export default function AdminSettingsPage() {
  const toast = useToast();

  // Point pricing
  const [pointCosts, setPointCosts] = useState({
    content: POINT_COSTS.content,
    character: POINT_COSTS.character,
    background: POINT_COSTS.background,
    meme: POINT_COSTS.meme,
  });
  const [savingPricing, setSavingPricing] = useState(false);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("info");
  const [creatingAnn, setCreatingAnn] = useState(false);
  const [loadingAnn, setLoadingAnn] = useState(true);

  const getToken = async () => {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token ?? "";
  };

  const fetchSettings = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.settings?.point_costs) {
        setPointCosts(data.settings.point_costs);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    setLoadingAnn(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/announcements", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
    } catch { /* ignore */ }
    setLoadingAnn(false);
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchAnnouncements();
  }, [fetchSettings, fetchAnnouncements]);

  const savePricing = async () => {
    setSavingPricing(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key: "point_costs", value: pointCosts }),
      });
      if (!res.ok) throw new Error();
      toast.success("Đã lưu cấu hình giá points");
    } catch {
      toast.error("Lưu thất bại");
    }
    setSavingPricing(false);
  };

  const createAnnouncement = async () => {
    if (!newTitle.trim()) return;
    setCreatingAnn(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim(), type: newType }),
      });
      if (!res.ok) throw new Error();
      toast.success("Đã tạo thông báo");
      setNewTitle("");
      setNewContent("");
      fetchAnnouncements();
    } catch {
      toast.error("Tạo thông báo thất bại");
    }
    setCreatingAnn(false);
  };

  const toggleAnnouncement = async (id: string, is_active: boolean) => {
    try {
      const token = await getToken();
      await fetch("/api/admin/announcements", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active }),
      });
      fetchAnnouncements();
    } catch { /* ignore */ }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/admin/announcements?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchAnnouncements();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <h1 className="text-2xl font-bold th-text-primary mb-2">Cấu hình hệ thống</h1>
        <p className="th-text-tertiary mb-8">Quản lý giá points và thông báo</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Point Pricing */}
          <div className="p-6 rounded-2xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
            <h2 className="text-sm font-semibold th-text-primary flex items-center gap-2 mb-5">
              <Coins size={16} style={{ color: "#f59e0b" }} />
              Giá point theo tính năng
            </h2>
            <div className="space-y-4">
              {[
                { key: "content" as const, label: "Tạo nội dung AI (text)", current: POINT_COSTS.content },
                { key: "character" as const, label: "Tạo ảnh nhân vật (1K)", current: POINT_COSTS.character },
                { key: "background" as const, label: "Tạo background AI (2K)", current: POINT_COSTS.background },
                { key: "meme" as const, label: "Tạo ảnh meme AI (2K)", current: POINT_COSTS.meme },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm th-text-primary">{item.label}</p>
                    <p className="text-xs th-text-muted">Mặc định: {item.current} pts</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={pointCosts[item.key]}
                      onChange={(e) => setPointCosts((prev) => ({ ...prev, [item.key]: parseInt(e.target.value) || 0 }))}
                      className="w-20 px-3 py-2 rounded-lg text-sm text-center th-bg-tertiary th-text-primary"
                      style={{ border: "1px solid var(--border-primary)" }}
                    />
                    <span className="text-xs th-text-muted">pts</span>
                  </div>
                </div>
              ))}

              <div className="pt-3 border-t" style={{ borderColor: "var(--border-primary)" }}>
                <Button onClick={savePricing} loading={savingPricing} className="w-full">
                  <Save size={16} /> Lưu cấu hình giá
                </Button>
                <p className="text-[10px] th-text-muted mt-2 text-center">
                  Lưu ý: Thay đổi giá chỉ có hiệu lực khi cập nhật code point-pricing.ts. Bảng này dùng để ghi nhận cấu hình.
                </p>
              </div>
            </div>

            {/* Current packages reference */}
            <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--border-primary)" }}>
              <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider mb-3">Gói nạp hiện tại</h3>
              <div className="space-y-2">
                {POINT_PACKAGES.map((pkg) => (
                  <div key={pkg.id} className="flex items-center justify-between text-xs">
                    <span className="th-text-secondary">
                      {pkg.name} {pkg.popular ? "⭐" : ""}
                    </span>
                    <span className="th-text-primary font-medium">
                      {pkg.points} pts / {pkg.price.toLocaleString("vi-VN")}đ
                      {pkg.bonus && <span className="th-text-muted ml-1">({pkg.bonus})</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Announcements */}
          <div className="space-y-6">
            {/* Create new */}
            <div className="p-6 rounded-2xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
              <h2 className="text-sm font-semibold th-text-primary flex items-center gap-2 mb-5">
                <Bell size={16} style={{ color: "#6366f1" }} />
                Tạo thông báo mới
              </h2>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Tiêu đề thông báo..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm th-bg-tertiary th-text-primary"
                  style={{ border: "1px solid var(--border-primary)" }}
                />
                <textarea
                  placeholder="Nội dung chi tiết (tuỳ chọn)..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl text-sm th-bg-tertiary th-text-primary"
                  style={{ border: "1px solid var(--border-primary)" }}
                />
                <div className="flex gap-2">
                  {ANNOUNCEMENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setNewType(t.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        newType === t.value ? "ring-2" : "opacity-60"
                      }`}
                      style={{
                        background: `${t.color}20`,
                        color: t.color,
                        ...(newType === t.value ? { boxShadow: `0 0 0 2px ${t.color}40` } : {}),
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <Button onClick={createAnnouncement} loading={creatingAnn} disabled={!newTitle.trim()} className="w-full">
                  <Plus size={16} /> Tạo thông báo
                </Button>
              </div>
            </div>

            {/* List */}
            <div className="p-6 rounded-2xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
              <h2 className="text-sm font-semibold th-text-primary mb-4">Danh sách thông báo</h2>
              {loadingAnn ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 th-bg-tertiary rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : announcements.length === 0 ? (
                <p className="text-sm th-text-muted text-center py-8">Chưa có thông báo</p>
              ) : (
                <div className="space-y-3">
                  {announcements.map((ann) => {
                    const typeStyle = ANNOUNCEMENT_TYPES.find((t) => t.value === ann.type) || ANNOUNCEMENT_TYPES[0];
                    return (
                      <div
                        key={ann.id}
                        className={`p-4 rounded-xl border transition-all ${ann.is_active ? "" : "opacity-50"}`}
                        style={{ borderColor: "var(--border-primary)" }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: `${typeStyle.color}20`, color: typeStyle.color }}>
                                {typeStyle.label}
                              </span>
                              <span className={`text-[10px] ${ann.is_active ? "th-text-accent" : "th-text-muted"}`}>
                                {ann.is_active ? "Đang hiển thị" : "Đã ẩn"}
                              </span>
                            </div>
                            <p className="text-sm font-medium th-text-primary">{ann.title}</p>
                            {ann.content && <p className="text-xs th-text-secondary mt-0.5">{ann.content}</p>}
                            <p className="text-[10px] th-text-muted mt-1">
                              {new Date(ann.created_at).toLocaleString("vi-VN")}
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => toggleAnnouncement(ann.id, !ann.is_active)}
                              className="p-1.5 rounded-lg th-bg-hover transition-all"
                              title={ann.is_active ? "Ẩn" : "Hiển thị"}
                            >
                              {ann.is_active ? <EyeOff size={14} className="th-text-muted" /> : <Eye size={14} className="th-text-accent" />}
                            </button>
                            <button
                              onClick={() => deleteAnnouncement(ann.id)}
                              className="p-1.5 rounded-lg th-bg-hover transition-all"
                              title="Xoá"
                            >
                              <Trash2 size={14} style={{ color: "#ef4444" }} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
