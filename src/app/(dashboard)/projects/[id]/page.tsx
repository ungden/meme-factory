"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Clapperboard,
  Images,
  Image as ImageIcon,
  Megaphone,
  MessageCircle,
  Shirt,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { useProject, useCharacters, useMemes } from "@/lib/use-store";
import { getProjectCover } from "@/lib/project-visuals";
import Sidebar from "@/components/layout/sidebar";

const modes = [
  {
    title: "Ý tưởng & chú thích",
    description: "Từ yêu cầu ngắn thành câu mở đầu, chú thích và lịch đăng.",
    icon: MessageCircle,
    color: "#f05a32",
    path: "generate",
  },
  {
    title: "Meme & bài đăng",
    description: "Giữ đúng nhân vật qua meme, bài vuông và chuỗi ảnh.",
    icon: ImageIcon,
    color: "#265ee8",
    path: "studio?mode=social",
  },
  {
    title: "TikTok & Reels",
    description: "Lên câu mở đầu, hướng dẫn dựng cảnh và hình dọc nhất quán.",
    icon: Video,
    color: "#12a594",
    path: "studio?mode=social",
  },
  {
    title: "Quảng cáo",
    description: "Tạo hình chủ đạo và biến thể theo từng nền tảng.",
    icon: Megaphone,
    color: "#f59e0b",
    path: "studio?mode=product",
  },
  {
    title: "Thời trang",
    description: "Giữ đúng người mẫu, trang phục và định hướng hình ảnh của chiến dịch.",
    icon: Shirt,
    color: "#df6b8b",
    path: "studio?mode=fashion",
  },
  {
    title: "Storyboard",
    description: "Khi cần, dựng cảnh và cú máy theo mạch kể dài hơn.",
    icon: Clapperboard,
    color: "#7668d6",
    path: "studio?mode=storyboard",
  },
];

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const { project, loading: projectLoading } = useProject(projectId);
  const { characters, loading: charactersLoading } = useCharacters(projectId);
  const { memes, loading: memesLoading } = useMemes(projectId);
  const loading = projectLoading || charactersLoading || memesLoading;

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

  const recentOutputs = memes.slice(0, 4);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weeklyOutputs = memes.filter((meme) => new Date(meme.created_at) > sevenDaysAgo).length;
  const stats = [
    { label: "Tài nguyên nhân vật", value: characters.length, icon: Users },
    { label: "Đầu ra đã lưu", value: memes.length, icon: Images },
    { label: "Tạo trong 7 ngày", value: weeklyOutputs, icon: TrendingUp },
  ];
  const projectCover = getProjectCover(project.name, project.description || "");

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
            <button onClick={() => router.push(`/projects/${projectId}/studio`)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500">
              <Clapperboard size={17} /> Mở Studio
            </button>
          </header>

          <section className="relative mb-8 overflow-hidden rounded-[28px] border bg-[#fbf6e9] text-[#171818] shadow-[0_18px_55px_rgba(73,53,15,.09)]" style={{ borderColor: "rgba(93,76,42,.16)" }}>
            <div className="absolute inset-y-0 right-0 w-full md:w-[68%]">
              <Image src={projectCover} alt={`Không gian media của ${project.name}`} fill priority sizes="(max-width: 768px) 100vw, 66vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#fbf6e9] via-[#fbf6e9]/90 to-[#fbf6e9]/5" />
            </div>
            <div className="relative max-w-xl px-6 py-10 md:px-9 md:py-12">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-600/20 bg-blue-600/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700"><Zap size={12} /> Hệ thống nội dung của bạn</span>
              <h2 className="mt-5 text-3xl font-bold leading-[1.08] tracking-[-0.025em] md:text-[40px]">Nhân vật nhất quán.<br />Nội dung đều đặn.</h2>
              <p className="mt-4 max-w-lg text-sm leading-6 text-[#5c5c54]">AIDA nhớ nhân vật, giọng điệu và tài nguyên thương hiệu. Bạn chỉ cần chọn định dạng và nói ý tưởng hôm nay.</p>
              <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-[#5c5c54]">
                {["Ý tưởng & chú thích", "Ảnh tham chiếu", "AI dựng cảnh", "Duyệt đầu ra"].map((feature) => <span key={feature} className="rounded-lg border border-black/10 bg-white/55 px-2.5 py-1.5">{feature}</span>)}
              </div>
            </div>
          </section>

          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold th-text-primary">Hôm nay bạn muốn làm gì?</h2><p className="mt-1 text-sm th-text-tertiary">Chọn đầu ra. AIDA giữ nguyên nhân vật và mở đúng bộ điều khiển.</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {modes.map((mode) => (
                <button key={mode.title} onClick={() => router.push(`/projects/${projectId}/${mode.path}`)} className="group rounded-2xl border p-5 text-left transition hover:-translate-y-1 hover:shadow-xl" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                  <div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${mode.color}18`, color: mode.color }}><mode.icon size={19} /></span><ArrowRight size={16} className="th-text-muted transition group-hover:translate-x-1" /></div>
                  <h3 className="mt-7 font-semibold th-text-primary">{mode.title}</h3>
                  <p className="mt-2 text-sm leading-5 th-text-tertiary">{mode.description}</p>
                </button>
              ))}
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
              <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold th-text-primary">Tài nguyên gần đây</h2><Link href={`/projects/${projectId}/characters`} className="flex items-center gap-1 text-xs font-medium text-blue-500">Xem thư viện <ArrowRight size={12} /></Link></div>
              <div className="rounded-2xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                {characters.length > 0 ? characters.slice(0, 4).map((character, index) => {
                  const image = character.avatar_url || character.poses[0]?.image_url;
                  const fallback = index % 2 === 0 ? "/continuity/linh-master.webp" : "/continuity/minh-master.webp";
                  return <Link key={character.id} href={`/projects/${projectId}/characters/${character.id}`} className="flex items-center gap-3 rounded-xl p-2.5 th-bg-hover"><span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl"><Image src={image && !image.startsWith("/mock/") ? image : fallback} alt={character.name} fill sizes="44px" className="object-cover" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm th-text-primary">{character.name}</strong><small className="mt-0.5 block text-xs th-text-muted">{character.poses.length} ảnh tham chiếu</small></span><ArrowRight size={14} className="th-text-muted" /></Link>;
                }) : <div className="py-10 text-center"><p className="text-sm th-text-tertiary">Chưa có tài nguyên nhân vật.</p><Link href={`/projects/${projectId}/characters`} className="mt-3 inline-flex text-sm font-medium text-blue-500">Thêm nhân vật đầu tiên</Link></div>}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold th-text-primary">Đầu ra gần đây</h2><Link href={`/projects/${projectId}/gallery`} className="flex items-center gap-1 text-xs font-medium text-blue-500">Mở thư viện <ArrowRight size={12} /></Link></div>
              {recentOutputs.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {recentOutputs.map((output, index) => (
                    <button key={output.id} onClick={() => router.push(`/projects/${projectId}/gallery`)} className="group flex min-h-28 overflow-hidden rounded-2xl border text-left" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                      <span className="relative w-28 shrink-0 overflow-hidden bg-slate-900"><Image src={output.image_url || `/continuity/scene-02d-variant-${(index % 4) + 1}.webp`} alt="" fill sizes="112px" className="object-cover transition group-hover:scale-105" /></span>
                      <span className="min-w-0 p-3"><strong className="line-clamp-2 text-sm leading-5 th-text-primary">{output.generated_content.headline || output.title || "Đầu ra sáng tạo"}</strong><small className="mt-2 line-clamp-2 text-xs leading-4 th-text-muted">{output.original_idea}</small></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border text-center" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}><Images size={24} className="th-text-muted" /><p className="mt-3 text-sm th-text-tertiary">Đầu ra đầu tiên sẽ xuất hiện ở đây.</p><button onClick={() => router.push(`/projects/${projectId}/studio`)} className="mt-3 text-sm font-medium text-blue-500">Mở Studio</button></div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
