"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useProject, useCharacters, useMemes } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";
import Card, { CardContent } from "@/components/ui/card";
import Button from "@/components/ui/button";
import { Users, Image as ImageIcon, Zap, TrendingUp, Plus, ArrowRight, Clapperboard } from "lucide-react";

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();

  const { project, loading: projLoading } = useProject(projectId);
  const { characters, loading: charsLoading } = useCharacters(projectId);
  const { memes, loading: memesLoading } = useMemes(projectId);

  const loading = projLoading || charsLoading || memesLoading;

  if (loading) {
    return (
      <div className="flex">
        <Sidebar projectId={projectId} />
        <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 th-bg-tertiary rounded-lg" />
            <div className="grid grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => <div key={i} className="h-28 th-bg-card rounded-2xl" />)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bg-primary)" }}>
        <p className="th-text-tertiary">Không tìm thấy dự án</p>
      </div>
    );
  }

  const weekMemes = memes.filter((m) => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(m.created_at) > weekAgo;
  });

  const stats = [
    { label: "Nhân vật", value: characters.length, icon: Users, color: "violet" },
    { label: "Meme đã tạo", value: memes.length, icon: ImageIcon, color: "blue" },
    { label: "Tuần này", value: weekMemes.length, icon: TrendingUp, color: "green" },
  ];

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project.name} />
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold th-text-primary">{project.name}</h1>
          {project.description && <p className="th-text-tertiary mt-1">{project.description}</p>}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{
                  background: stat.color === "green" ? "var(--success-light)" : "var(--accent-light)"
                }}>
                  <stat.icon size={22} style={{
                    color: stat.color === "green" ? "var(--success)" : "var(--accent)"
                  }} />
                </div>
                <div>
                  <p className="text-2xl font-bold th-text-primary">{stat.value}</p>
                  <p className="text-sm th-text-tertiary">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card hover onClick={() => router.push(`/projects/${projectId}/studio`)} className="mb-8 overflow-hidden">
          <div className="relative flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between" style={{ background: "linear-gradient(115deg, #101827 0%, #111827 55%, #172554 100%)" }}>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-950/40">
                <Clapperboard size={26} />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">Continuity Studio</h2>
                  <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-200">Mới</span>
                </div>
                <p className="max-w-2xl text-sm text-slate-300">Chọn nhân vật, look, item và bối cảnh để dựng shot nhất quán — có timeline, review và repair trong cùng một workspace.</p>
              </div>
            </div>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500">
              Mở Studio <ArrowRight size={16} />
            </button>
          </div>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
          <Card hover onClick={() => router.push(`/projects/${projectId}/generate`)}>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Zap size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="font-semibold th-text-primary">Tạo Meme mới</h3>
                  <p className="text-sm th-text-tertiary">Nhập ý tưởng và để AI làm phép</p>
                </div>
              </div>
              <ArrowRight size={18} className="th-text-muted" />
            </CardContent>
          </Card>

          <Card hover onClick={() => router.push(`/projects/${projectId}/characters`)}>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center">
                  <Plus size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="font-semibold th-text-primary">Quản lý nhân vật</h3>
                  <p className="text-sm th-text-tertiary">Thêm hoặc chỉnh sửa nhân vật và biểu cảm</p>
                </div>
              </div>
              <ArrowRight size={18} className="th-text-muted" />
            </CardContent>
          </Card>

          <Card hover onClick={() => router.push(`/projects/${projectId}/members`)}>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                  <Users size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="font-semibold th-text-primary">Thành viên</h3>
                  <p className="text-sm th-text-tertiary">Mời và quản lý cộng tác</p>
                </div>
              </div>
              <ArrowRight size={18} className="th-text-muted" />
            </CardContent>
          </Card>

          <Card hover onClick={() => router.push(`/projects/${projectId}/wallet`)}>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <Zap size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="font-semibold th-text-primary">Ví dự án</h3>
                  <p className="text-sm th-text-tertiary">Deposit points cho team</p>
                </div>
              </div>
              <ArrowRight size={18} className="th-text-muted" />
            </CardContent>
          </Card>
        </div>

        {/* Characters preview */}
        {characters.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold th-text-primary">Nhân vật</h2>
              <Button variant="ghost" size="sm" onClick={() => router.push(`/projects/${projectId}/characters`)}>
                Xem tất cả <ArrowRight size={14} />
              </Button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {characters.slice(0, 6).map((char) => (
                <Link key={char.id} href={`/projects/${projectId}/characters/${char.id}`} className="flex-shrink-0 w-24 text-center group">
                  <div className="w-20 h-20 mx-auto th-bg-tertiary rounded-2xl overflow-hidden mb-2 flex items-center justify-center text-2xl font-bold th-text-muted transition-transform group-hover:scale-105 group-hover:ring-2 th-ring-accent">
                    {(char.avatar_url || char.poses[0]?.image_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={char.avatar_url || char.poses[0]?.image_url || ""} alt={char.name} className="w-full h-full object-cover" />
                    ) : (
                      char.name[0]?.toUpperCase()
                    )}
                  </div>
                  <p className="text-xs th-text-secondary truncate">{char.name}</p>
                  <p className="text-xs th-text-muted">{char.poses.length} biểu cảm</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent memes */}
        {memes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold th-text-primary">Meme gần đây</h2>
              <Button variant="ghost" size="sm" onClick={() => router.push(`/projects/${projectId}/gallery`)}>
                Xem tất cả <ArrowRight size={14} />
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {memes.slice(0, 6).map((meme) => (
                <Card key={meme.id} hover>
                  <div className="aspect-square th-bg-tertiary rounded-t-2xl overflow-hidden flex items-center justify-center">
                    {meme.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={meme.image_url} alt={(meme.generated_content as { headline?: string })?.headline || meme.original_idea} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-4">
                        <ImageIcon size={24} className="mx-auto th-text-muted mb-2" />
                        <p className="text-xs th-text-tertiary line-clamp-2">
                          {(meme.generated_content as { headline?: string })?.headline || meme.original_idea}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs th-text-tertiary truncate">{meme.original_idea}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
