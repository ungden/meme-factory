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
        <main className="ml-0 min-h-screen flex-1 p-4 pt-16 md:ml-64 md:p-8">
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

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project.name} />
      <main className="ml-0 min-h-screen flex-1 p-4 pt-16 md:ml-64 md:p-8 lg:p-10">
        <div className="mx-auto max-w-7xl">
          <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-500"><Sparkles size={14} /> Không gian dự án</div>
              <h1 className="text-3xl font-semibold tracking-tight th-text-primary">{project.name}</h1>
              {project.description && <p className="mt-2 max-w-2xl th-text-tertiary">{project.description}</p>}
            </div>
            <div className="flex flex-wrap gap-2"><button onClick={() => router.push(`/projects/${projectId}/generate`)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"><Sparkles size={17} /> Tạo ảnh</button><button onClick={() => router.push(`/projects/${projectId}/video/multiscene`)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-semibold th-text-primary" style={{ borderColor: "var(--border-primary)" }}><Clapperboard size={17} /> Video nhiều cảnh</button><button onClick={() => router.push(`/projects/${projectId}/video`)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold th-text-primary" style={{ borderColor: "var(--border-primary)" }}>Video một clip</button></div>
          </header>

          <section className="mb-8">
            <div className="rounded-2xl border p-6 md:flex md:items-center md:justify-between" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
              <div><h2 className="text-lg font-semibold th-text-primary">Bắt đầu tạo nội dung</h2><p className="mt-1 max-w-2xl text-sm th-text-tertiary">Tạo ảnh, video nhiều cảnh hoặc một clip. Cả ba dùng cùng nhân vật và thương hiệu của dự án.</p></div>
              <div className="mt-4 flex flex-wrap gap-2 md:mt-0"><button onClick={() => router.push(`/projects/${projectId}/generate`)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"><Sparkles size={16} /> Tạo ảnh</button><button onClick={() => router.push(`/projects/${projectId}/video/multiscene`)} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold th-text-primary" style={{ borderColor: "var(--border-primary)" }}><Clapperboard size={16} /> Video nhiều cảnh</button></div>
            </div>
          </section>

          <section className="mb-8 grid gap-4 md:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-4 rounded-2xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl th-bg-accent-light th-text-accent"><stat.icon size={19} /></span>
                <div><p className="text-2xl font-semibold th-text-primary">{stat.value}</p><p className="mt-0.5 text-xs th-text-tertiary">{stat.label}</p></div>
              </div>
            ))}
          </section>

          <div className="grid gap-7 xl:grid-cols-[.8fr_1.2fr]">
            <section>
              <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold th-text-primary">Tài nguyên gần đây</h2><Link href={`/projects/${projectId}/mascots`} className="flex items-center gap-1 text-xs font-medium text-blue-500">Xem thư viện <ArrowRight size={12} /></Link></div>
              <div className="rounded-2xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                {characters.length > 0 ? characters.slice(0, 4).map((character) => {
                  const image = character.avatar_url || character.poses[0]?.image_url;
                  return <Link key={character.id} href={`/projects/${projectId}/characters/${character.id}`} className="flex items-center gap-3 rounded-xl p-2.5 th-bg-hover"><span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl th-bg-tertiary text-sm font-semibold th-text-muted">{image && !image.startsWith("/mock/") ? <Image src={image} alt={character.name} fill sizes="44px" className="object-cover" /> : character.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm th-text-primary">{character.name}</strong><small className="mt-0.5 block text-xs th-text-muted">{character.poses.length} ảnh tham chiếu</small></span><ArrowRight size={14} className="th-text-muted" /></Link>;
                }) : <div className="py-10 text-center"><p className="text-sm th-text-tertiary">Chưa có tài nguyên nhân vật.</p><Link href={`/projects/${projectId}/mascots`} className="mt-3 inline-flex text-sm font-medium text-blue-500">Thêm nhân vật đầu tiên</Link></div>}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold th-text-primary">Đầu ra gần đây</h2><Link href={`/projects/${projectId}/gallery`} className="flex items-center gap-1 text-xs font-medium text-blue-500">Mở thư viện <ArrowRight size={12} /></Link></div>
              {recentOutputs.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {recentOutputs.map((output) => (
                    <button key={output.id} onClick={() => router.push(`/projects/${projectId}/gallery`)} className="group flex min-h-28 overflow-hidden rounded-2xl border text-left" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                      <span className="relative flex w-28 shrink-0 items-center justify-center overflow-hidden th-bg-tertiary">{output.image_url ? <Image src={output.image_url} alt="" fill sizes="112px" className="object-cover transition group-hover:scale-105" /> : <Images size={20} className="th-text-muted" />}</span>
                      <span className="min-w-0 p-3"><strong className="line-clamp-2 text-sm leading-5 th-text-primary">{output.generated_content.headline || output.title || "Đầu ra sáng tạo"}</strong><small className="mt-2 line-clamp-2 text-xs leading-4 th-text-muted">{output.original_idea}</small></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border text-center" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}><Images size={24} className="th-text-muted" /><p className="mt-3 text-sm th-text-tertiary">Đầu ra đầu tiên sẽ xuất hiện ở đây.</p><button onClick={() => router.push(`/projects/${projectId}/generate`)} className="mt-3 text-sm font-medium text-blue-500">Tạo nội dung</button></div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
