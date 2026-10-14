"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  Edit2,
  Images,
  MoreVertical,
  Plus,
  Trash2,
  Tv,
  Users,
} from "lucide-react";
import { useProjects, IS_MOCK_MODE } from "@/lib/use-store";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import ConfirmModal from "@/components/ui/confirm-modal";
import EmptyState from "@/components/ui/empty-state";
import { PageContainer, Skeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import AnnouncementBanner from "@/components/ui/announcement-banner";
import { getProjectRouteRef } from "@/lib/project-visuals";
import { fetchJsonCached, invalidateClientCache } from "@/lib/client-fetch";
import { KIND_PATH, parseComposeKind } from "@/lib/home-handoff";
import HomeComposer, { type ComposerPreset } from "./_components/home-composer";
import HomeFeedList from "./_components/home-feed-list";
import { useHomeFeed } from "./_components/use-home-feed";

export default function ProjectsPage() {
  const { projects, loading, remove } = useProjects();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [summaries, setSummaries] = useState<Record<string, { characterCount: number; outputCount: number; draftCount: number }>>({});
  // Tách "chưa tải xong" khỏi "tải hỏng": gộp hai trạng thái khiến một kênh
  // lâu năm bị gắn nhãn "Kênh mới" chỉ vì một lần gọi API thất bại.
  const [summariesFailed, setSummariesFailed] = useState(false);
  const requestedKind = parseComposeKind(searchParams.get("output"));

  useEffect(() => {
    if (IS_MOCK_MODE || !projects.length) return;
    let active = true;
    fetchJsonCached<{ summaries?: Record<string, { characterCount: number; outputCount: number; draftCount: number }> }>("/api/projects/summaries", 60_000)
      .then((payload) => { if (active && payload?.summaries) { setSummaries(payload.summaries); setSummariesFailed(false); } })
      .catch(() => { if (active) setSummariesFailed(true); });
    return () => { active = false; };
  }, [projects.length]);

  const feed = useHomeFeed();
  const [preset, setPreset] = useState<ComposerPreset | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await remove(deleteTarget);
    invalidateClientCache("/api/projects/summaries");
    toast.success("Đã xoá kênh");
    setDeleteTarget(null);
    setMenuOpen(null);
  };

  const openChannel = (projectRef: string) => {
    const query = searchParams.toString();
    const destination = requestedKind ? `/${KIND_PATH[requestedKind]}` : "";
    router.push(`/projects/${projectRef}${destination}${query ? `?${query}` : ""}`);
  };

  return (
    <PageContainer width="wide" className="overflow-x-hidden">
      {IS_MOCK_MODE && (
        <Alert tone="info" className="mb-6">Đang xem bằng dữ liệu mẫu.</Alert>
      )}

      <AnnouncementBanner />

      <div className="relative mx-auto mb-14 max-w-3xl pt-4 sm:pt-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-[-30%] -top-24 h-[420px] th-glow" />
        <div className="relative">
          {loading ? <Skeleton className="h-56 rounded-3xl" /> : <HomeComposer projects={projects} onStarted={feed.reload} preset={preset} />}
        </div>
      </div>

      {projects.length > 0 && (
        <div className="mb-10">
          <HomeFeedList
            items={feed.items}
            loading={feed.loading}
            failed={feed.failed}
            onRemix={(item) => setPreset({ kind: item.kind, projectId: item.projectId, format: item.format, nonce: Date.now() })}
          />
        </div>
      )}

      <section aria-labelledby="channels-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="channels-title" className="text-base font-semibold th-text-primary">Kênh của bạn</h2>
          {projects.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => router.push("/projects/new")}>
              <Plus size={14} /> Kênh mới
            </Button>
          )}
        </div>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-28" />)}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={Tv}
            title="Chưa có kênh nào"
            hint="Chỉ cần vài câu mô tả, AIDA điền sẵn hồ sơ kênh cho bạn."
            action={
              <Button size="sm" onClick={() => router.push("/projects/new")}>
                <Plus size={14} /> Tạo kênh đầu tiên
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const projectRef = getProjectRouteRef(project);
              const summary = summaries[project.id];
              const autopilot = feed.autopilot[project.id];
              return (
                <article
                  key={project.id}
                  className="group relative flex items-start gap-3 rounded-2xl border p-4 transition-all th-border th-bg-card hover:-translate-y-0.5 hover:th-shadow-md"
                >
                  <button
                    onClick={() => openChannel(projectRef)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    aria-label={`Mở kênh ${project.name}`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold th-bg-gradient th-text-on-primary">
                      {project.name.trim().slice(0, 2).toLocaleUpperCase("vi")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold th-text-primary">{project.name}</span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs th-text-secondary">
                        {autopilot ? (<><CalendarClock size={12} className="shrink-0 th-text-accent" /> {autopilot}</>) : "Chưa bật tự làm mỗi ngày"}
                      </span>
                      <span className="mt-2 flex gap-3 text-xs th-text-muted">
                        {summary ? (<><span className="flex items-center gap-1"><Users size={12} /> {summary.characterCount} nhân vật</span><span className="flex items-center gap-1"><Images size={12} /> {summary.outputCount} bài</span></>) : (<span>{summariesFailed ? "Chưa tải được số liệu" : "Đang tải số liệu"}</span>)}
                      </span>
                      {summary && summary.draftCount > 0 && <span className="mt-1 block text-xs font-medium th-text-warning">{summary.draftCount} bài đang làm dở</span>}
                    </span>
                  </button>
                  <div className="relative">
                    <button
                      aria-label="Tuỳ chọn kênh"
                      aria-expanded={menuOpen === project.id}
                      onClick={() => setMenuOpen(menuOpen === project.id ? null : project.id)}
                      className="rounded-lg p-2 th-text-muted th-bg-hover"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuOpen === project.id && (
                      <div className="absolute right-0 top-10 z-10 w-40 rounded-xl border py-1 th-border th-bg-tertiary th-shadow-lg">
                        <button onClick={() => { router.push(`/projects/${projectRef}`); setMenuOpen(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm th-text-secondary th-bg-hover"><Edit2 size={14} /> Mở kênh</button>
                        <button onClick={() => { router.push(`/projects/${projectRef}/short-films`); setMenuOpen(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm th-text-secondary th-bg-hover"><ArrowRight size={14} /> Phim ngắn</button>
                        <button onClick={() => setDeleteTarget(project.id)} className="flex w-full items-center gap-2 px-3 py-2 text-sm th-text-danger th-bg-hover"><Trash2 size={14} /> Xoá</button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Xoá kênh?"
        message="Mọi nhân vật, phim, meme của kênh sẽ mất hẳn, không lấy lại được."
        confirmText="Xoá kênh"
        variant="danger"
      />
    </PageContainer>
  );
}
