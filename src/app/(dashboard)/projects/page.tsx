"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  Edit2,
  Images,
  MoreVertical,
  Plus,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { useProjects, IS_MOCK_MODE } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import ConfirmModal from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import AnnouncementBanner from "@/components/ui/announcement-banner";
import { getProjectRouteRef } from "@/lib/project-visuals";
import { fetchJsonCached, invalidateClientCache } from "@/lib/client-fetch";
import { feedIsBusy, type FeedItem } from "@/lib/home-feed";
import HomeComposer, { NEW_CHANNEL, type ComposerPreset } from "./_components/home-composer";
import HomeFeedList from "./_components/home-feed-list";

export default function ProjectsPage() {
  const { projects, loading, remove, reload } = useProjects();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [summaries, setSummaries] = useState<Record<string, { characterCount: number; outputCount: number; draftCount: number }>>({});
  // Tách "chưa tải xong" khỏi "tải hỏng": gộp hai trạng thái khiến một dự án
  // lâu năm bị gắn nhãn "Dự án mới" chỉ vì một lần gọi API thất bại.
  const [summariesFailed, setSummariesFailed] = useState(false);
  const requestedDestination = () => {
    const output = searchParams.get("output");
    if (output === "Tạo phim ngắn") return "short-films";
    if (output === "Tạo video") return "video";
    if (output === "Tạo ảnh") return "generate";
    return "";
  };

  useEffect(() => {
    if (IS_MOCK_MODE || !projects.length) return;
    let active = true;
    fetchJsonCached<{ summaries?: Record<string, { characterCount: number; outputCount: number; draftCount: number }> }>("/api/projects/summaries", 60_000)
      .then((payload) => { if (active && payload?.summaries) { setSummaries(payload.summaries); setSummariesFailed(false); } })
      .catch(() => { if (active) setSummariesFailed(true); });
    return () => { active = false; };
  }, [projects.length]);

  const [feed, setFeed] = useState<{ items: FeedItem[]; autopilot: Record<string, string> }>({ items: [], autopilot: {} });
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedFailed, setFeedFailed] = useState(false);
  const loadFeed = useCallback(async () => {
    if (IS_MOCK_MODE) return setFeedLoading(false);
    try {
      const response = await fetch("/api/home", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      setFeed(await response.json());
      setFeedFailed(false);
    } catch {
      setFeedFailed(true);
    } finally {
      setFeedLoading(false);
    }
  }, []);
  const busy = feedIsBusy(feed.items);
  const [preset, setPreset] = useState<ComposerPreset | null>(null);
  // Có việc đang chạy thì cập nhật nhanh để người dùng thấy kết quả về ngay.
  useEffect(() => {
    void loadFeed();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadFeed();
    }, busy ? 5000 : 60000);
    return () => clearInterval(timer);
  }, [loadFeed, busy]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await remove(deleteTarget);
    invalidateClientCache("/api/projects/summaries");
    toast.success("Đã xoá kênh");
    setDeleteTarget(null);
    setMenuOpen(null);
  };

  return (
    <div className="flex">
      <Sidebar />
      <main className="ml-0 min-h-screen flex-1 p-4 pt-16 lg:ml-56 md:p-8 lg:p-10">
        <div className="mx-auto max-w-7xl">
          {IS_MOCK_MODE && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 th-border-accent th-bg-accent-light">
              <Zap size={18} className="th-text-accent" />
              <p className="text-sm th-text-accent"><strong>Chế độ Dev</strong> — Đang dùng dữ liệu mẫu. Kết nối database để go live.</p>
            </div>
          )}

          <AnnouncementBanner />

          <div className="mx-auto mb-10 max-w-3xl pt-2 sm:pt-6">
            {loading ? <div className="h-56 animate-pulse rounded-2xl th-bg-card" /> : <HomeComposer projects={projects} onStarted={loadFeed} onChannelCreated={reload} preset={preset} />}
          </div>

          {projects.length > 0 && (
            <div className="mb-10">
              <HomeFeedList
                items={feed.items}
                loading={feedLoading}
                failed={feedFailed}
                onRemix={(item) => setPreset({ kind: item.kind, projectId: item.projectId, format: item.format, nonce: Date.now() })}
              />
            </div>
          )}

          <section aria-labelledby="channels-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="channels-title" className="text-lg font-semibold th-text-primary">Kênh của bạn</h2>
              {projects.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setPreset({ projectId: NEW_CHANNEL, nonce: Date.now() })}>
                  <Plus size={15} /> Kênh mới
                </Button>
              )}
            </div>
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl th-bg-card" />)}
            </div>
          ) : projects.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm th-border th-text-secondary">
              Chưa có kênh nào. Gõ ý tưởng đầu tiên ở trên, AI dựng kênh, đặt tên và nghĩ nhân vật cho bạn.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => {
                const projectRef = getProjectRouteRef(project);
                const summary = summaries[project.id];
                const autopilot = feed.autopilot[project.id];
                return (
                <article
                  key={project.id}
                  className="relative flex items-start gap-3 rounded-xl border p-4 transition hover:th-border-accent"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
                >
                  <button
                    onClick={() => { const query = searchParams.toString(); const destination = requestedDestination(); router.push(`/projects/${projectRef}${destination ? `/${destination}` : ""}${query ? `?${query}` : ""}`); }}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    aria-label={`Mở kênh ${project.name}`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold th-bg-accent-light th-text-accent">
                      {project.name.trim().slice(0, 2).toLocaleUpperCase("vi")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold th-text-primary">{project.name}</span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs th-text-secondary">
                        {autopilot ? (<><CalendarClock size={12} className="shrink-0 th-text-accent" /> {autopilot}</>) : "Chưa bật tự làm hằng ngày"}
                      </span>
                      <span className="mt-2 flex gap-3 text-xs th-text-muted">
                        {summary ? (<><span className="flex items-center gap-1"><Users size={12} /> {summary.characterCount} nhân vật</span><span className="flex items-center gap-1"><Images size={12} /> {summary.outputCount} đã làm</span></>) : (<span>{summariesFailed ? "Chưa tải được số liệu" : "Đang tải số liệu"}</span>)}
                      </span>
                      {summary && summary.draftCount > 0 && <span className="mt-1 block text-xs font-medium th-text-warning">{summary.draftCount} bộ nội dung đang làm dở</span>}
                    </span>
                  </button>
                  <div className="relative">
                    <button
                      aria-label="Tuỳ chọn kênh"
                      onClick={() => setMenuOpen(menuOpen === project.id ? null : project.id)}
                      className="rounded-lg p-2 th-text-muted th-bg-hover"
                    >
                      <MoreVertical size={17} />
                    </button>
                    {menuOpen === project.id && (
                      <div className="absolute right-0 top-10 z-10 w-40 rounded-xl border py-1 shadow-xl" style={{ background: "var(--bg-tertiary)", borderColor: "var(--border-primary)" }}>
                        <button onClick={() => { router.push(`/projects/${projectRef}`); setMenuOpen(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm th-text-secondary th-bg-hover"><Edit2 size={14} /> Mở kênh</button>
                        <button onClick={() => { router.push(`/projects/${projectRef}/short-films`); setMenuOpen(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm th-text-secondary th-bg-hover"><ArrowRight size={14} /> Studio phim</button>
                        <button onClick={() => setDeleteTarget(project.id)} className="flex w-full items-center gap-2 px-3 py-2 text-sm th-bg-hover" style={{ color: "var(--danger)" }}><Trash2 size={14} /> Xoá</button>
                      </div>
                    )}
                  </div>
                </article>
              );})}
            </div>
          )}
          </section>
        </div>

        <ConfirmModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Xoá kênh?"
          message="Toàn bộ nhân vật, phim, meme và lịch sử tạo trong kênh sẽ bị xoá vĩnh viễn."
          confirmText="Xoá kênh"
          variant="danger"
        />
      </main>
    </div>
  );
}
