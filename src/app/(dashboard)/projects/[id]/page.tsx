"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Images,
  Clapperboard,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useProject } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const { project, loading: projectLoading } = useProject(projectId);
  const [overview, setOverview] = useState<{ characterCount: number; outputCount: number; weeklyOutputCount: number; characters: { id: string; name: string; avatar_url: string | null; poses: { id: string; image_url: string }[] }[]; recentOutputs: { id: string; title: string | null; original_idea: string; generated_content: { headline?: string }; image_url: string | null }[]; activeJobs: { id: string; status: string }[] } | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/overview`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (!controller.signal.aborted) setOverview(data); })
      .catch(() => { if (!controller.signal.aborted) setOverview(null); })
      .finally(() => { if (!controller.signal.aborted) setOverviewLoading(false); });
    return () => controller.abort();
  }, [projectId]);

  const characters = overview?.characters ?? [];
  const recentOutputs = overview?.recentOutputs ?? [];
  const loading = projectLoading || overviewLoading;

  if (loading) {
    return (
      <div className="flex">
        <Sidebar projectId={projectId} />
        <main className="ml-0 min-h-screen flex-1 p-4 pt-16 lg:ml-56 md:p-8">
          <div className="mx-auto max-w-7xl animate-pulse space-y-6"><div className="h-9 w-72 rounded-lg th-bg-tertiary" /><div className="h-72 rounded-3xl th-bg-card" /><div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-44 rounded-2xl th-bg-card" />)}</div></div>
        </main>
      </div>
    );
  }

  if (!project) {
    return <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg-primary)" }}><p className="th-text-tertiary">Không tìm thấy dự án</p></div>;
  }

  const stats = [
    { label: "Tài nguyên nhân vật", value: overview?.characterCount ?? 0, icon: Users },
    { label: "Đầu ra đã lưu", value: overview?.outputCount ?? 0, icon: Images },
    { label: "Tạo trong 7 ngày", value: overview?.weeklyOutputCount ?? 0, icon: TrendingUp },
  ];
  const isEmpty = stats.every((stat) => stat.value === 0);

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project.name} />
      <main className="ml-0 min-h-screen flex-1 p-4 pt-16 lg:ml-56 md:p-8 lg:p-10">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight th-text-primary">{project.name}</h1>
              {project.description && <p className="mt-2 max-w-2xl text-sm th-text-tertiary">{project.description}</p>}
            </div>
            <div className="flex flex-wrap gap-2"><button onClick={() => router.push(`/projects/${projectId}/generate`)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white th-shadow-sm" style={{ background: "var(--accent)" }}><Sparkles size={16} /> Tạo ảnh</button><button onClick={() => router.push(`/projects/${projectId}/video`)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold th-text-primary th-bg-card th-bg-hover" style={{ borderColor: "var(--border-primary)" }}><Clapperboard size={16} /> Tạo video</button><button onClick={() => router.push(`/projects/${projectId}/video/multiscene`)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold th-text-primary th-bg-card th-bg-hover" style={{ borderColor: "var(--border-primary)" }}><Clapperboard size={16} /> Tạo phim ngắn</button></div>
          </header>

          {isEmpty ? (
            <section className="max-w-2xl rounded-xl border p-6 sm:p-8" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl th-bg-accent-light th-text-accent"><Users size={19} /></span>
              <h2 className="mt-5 text-xl font-semibold th-text-primary">Bắt đầu với nhân vật đầu tiên</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 th-text-tertiary">Tạo ảnh chuẩn 3D để dùng nhất quán cho ảnh và video. Bạn vẫn có thể tạo nội dung ngay khi chưa cần nhân vật.</p>
              <div className="mt-5 flex flex-wrap gap-3"><Link href={`/projects/${projectId}/mascots`} className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white th-shadow-sm" style={{ background: "var(--accent)" }}><Users size={16} /> Tạo nhân vật đầu tiên</Link><Link href={`/projects/${projectId}/generate`} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold th-text-primary th-bg-hover" style={{ borderColor: "var(--border-primary)" }}><Sparkles size={16} /> Tạo nội dung không dùng nhân vật</Link></div>
            </section>
          ) : <>
          <section className="mb-8 flex flex-wrap gap-x-6 gap-y-2 border-y py-3 text-sm" style={{ borderColor: "var(--border-primary)" }}>
            {stats.map((stat) => <div key={stat.label} className="flex items-center gap-2 th-text-secondary"><stat.icon size={16} className="th-text-accent" /><strong className="th-text-primary">{stat.value}</strong><span>{stat.label}</span></div>)}
          </section>

          <div className="grid gap-7 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
            <section>
              <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold th-text-primary">Nhân vật</h2><Link href={`/projects/${projectId}/mascots`} className="flex items-center gap-1 text-xs font-medium th-text-accent">Xem tất cả <ArrowRight size={12} /></Link></div>
              <div className="rounded-xl border p-2" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                {characters.length > 0 ? characters.slice(0, 4).map((character) => {
                  const image = character.avatar_url || character.poses[0]?.image_url;
                  return <Link key={character.id} href={`/projects/${projectId}/characters/${character.id}`} className="flex items-center gap-3 rounded-xl p-2.5 th-bg-hover"><span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl th-bg-tertiary text-sm font-semibold th-text-muted">{image && !image.startsWith("/mock/") ? <Image src={image} alt={character.name} fill sizes="44px" className="object-cover" /> : character.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm th-text-primary">{character.name}</strong><small className="mt-0.5 block text-xs th-text-muted">{character.poses.length} ảnh tham chiếu</small></span><ArrowRight size={14} className="th-text-muted" /></Link>;
                }) : <div className="py-7 text-center"><p className="text-sm th-text-tertiary">Chưa có nhân vật.</p><Link href={`/projects/${projectId}/mascots`} className="mt-2 inline-flex text-sm font-medium th-text-accent">Tạo nhân vật</Link></div>}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold th-text-primary">Kết quả gần đây</h2><Link href={`/projects/${projectId}/gallery`} className="flex items-center gap-1 text-xs font-medium th-text-accent">Mở thư viện <ArrowRight size={12} /></Link></div>
              {recentOutputs.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {recentOutputs.map((output) => (
                    <button key={output.id} onClick={() => router.push(`/projects/${projectId}/gallery`)} className="group flex min-h-28 overflow-hidden rounded-xl border text-left" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                      <span className="relative flex w-28 shrink-0 items-center justify-center overflow-hidden th-bg-tertiary">{output.image_url ? <Image src={output.image_url} alt="" fill sizes="112px" className="object-cover transition group-hover:scale-105" /> : <Images size={20} className="th-text-muted" />}</span>
                      <span className="min-w-0 p-3"><strong className="line-clamp-2 text-sm leading-5 th-text-primary">{output.generated_content.headline || output.title || "Đầu ra sáng tạo"}</strong><small className="mt-2 line-clamp-2 text-xs leading-4 th-text-muted">{output.original_idea}</small></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border text-center" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}><Images size={22} className="th-text-muted" /><p className="mt-3 text-sm th-text-tertiary">Kết quả đầu tiên sẽ xuất hiện ở đây.</p><button onClick={() => router.push(`/projects/${projectId}/generate`)} className="mt-2 text-sm font-medium th-text-accent">Tạo ảnh</button></div>
              )}
            </section>
          </div></>}
        </div>
      </main>
    </div>
  );
}
