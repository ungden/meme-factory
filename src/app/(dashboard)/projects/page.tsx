"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Clapperboard,
  Edit2,
  Images,
  MoreVertical,
  Plus,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { useProjects, IS_MOCK_MODE } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import ConfirmModal from "@/components/ui/confirm-modal";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import AnnouncementBanner from "@/components/ui/announcement-banner";

const projectCovers = [
  "/continuity/scene-02d-main.webp",
  "/continuity/reference-board.webp",
  "/continuity/scene-02d-variant-3.webp",
];

export default function ProjectsPage() {
  const { projects, loading, create, remove } = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "", style_prompt: "" });
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    const project = await create({
      name: newProject.name,
      description: newProject.description || undefined,
      style_prompt: newProject.style_prompt || undefined,
    });
    if (project) {
      setShowCreate(false);
      setNewProject({ name: "", description: "", style_prompt: "" });
      toast.success(`Đã tạo dự án "${project.name}"`);
      router.push(`/projects/${project.slug}`);
    } else {
      toast.error("Không thể tạo dự án. Vui lòng thử lại.");
    }
    setCreating(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await remove(deleteTarget);
    toast.success("Đã xoá dự án");
    setDeleteTarget(null);
    setMenuOpen(null);
  };

  return (
    <div className="flex">
      <Sidebar />
      <main className="ml-0 min-h-screen flex-1 p-4 pt-16 md:ml-64 md:p-8 lg:p-10">
        <div className="mx-auto max-w-7xl">
          {IS_MOCK_MODE && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 th-border-accent th-bg-accent-light">
              <Zap size={18} className="th-text-accent" />
              <p className="text-sm th-text-accent"><strong>Chế độ Dev</strong> — Đang dùng dữ liệu mẫu. Kết nối database để go live.</p>
            </div>
          )}

          <AnnouncementBanner />

          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-500">
                <Sparkles size={14} /> AIDA Creative Studio
              </div>
              <h1 className="text-3xl font-semibold tracking-tight th-text-primary">Không gian sáng tạo</h1>
              <p className="mt-2 max-w-xl th-text-tertiary">Mỗi dự án giữ chung nhân vật, phong cách và toàn bộ đầu ra — từ meme đến campaign và storyboard.</p>
            </div>
            <Button onClick={() => setShowCreate(true)} size="lg" className="shrink-0 !bg-blue-600 !shadow-blue-600/20 hover:!bg-blue-500">
              <Plus size={18} /> Tạo dự án
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((item) => <div key={item} className="h-80 animate-pulse rounded-2xl th-bg-card" />)}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border py-24 text-center" style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}>
              <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500"><Clapperboard size={28} /></span>
              <h2 className="text-xl font-semibold th-text-primary">Tạo thế giới đầu tiên của bạn</h2>
              <p className="mt-2 max-w-md th-text-tertiary">Bắt đầu với tên dự án và định hướng hình ảnh. Bạn có thể thêm nhân vật, item và bối cảnh sau.</p>
              <Button onClick={() => setShowCreate(true)} className="mt-6"><Plus size={17} /> Tạo dự án đầu tiên</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {projects.map((project, index) => (
                <article
                  key={project.id}
                  className="group overflow-hidden rounded-2xl border transition hover:-translate-y-1 hover:shadow-2xl"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
                >
                  <button onClick={() => router.push(`/projects/${project.slug}`)} className="block w-full text-left" aria-label={`Mở dự án ${project.name}`}>
                    <div className="relative aspect-[16/8.5] overflow-hidden bg-slate-900">
                      <Image src={projectCovers[index % projectCovers.length]} alt="" fill priority={index === 0} sizes="(max-width: 1280px) 50vw, 33vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                      <div className="absolute bottom-3 left-3 flex gap-2">
                        <span className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">ĐA ĐỊNH DẠNG</span>
                        <span className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] text-white/75 backdrop-blur-md">CONTINUITY</span>
                      </div>
                    </div>
                  </button>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold th-text-primary">{project.name}</h2>
                        <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 th-text-tertiary">{project.description || "Chưa có mô tả dự án"}</p>
                      </div>
                      <div className="relative">
                        <button
                          aria-label="Tuỳ chọn dự án"
                          onClick={() => setMenuOpen(menuOpen === project.id ? null : project.id)}
                          className="rounded-lg p-2 th-text-muted th-bg-hover"
                        >
                          <MoreVertical size={17} />
                        </button>
                        {menuOpen === project.id && (
                          <div className="absolute right-0 top-10 z-10 w-40 rounded-xl border py-1 shadow-xl" style={{ background: "var(--bg-tertiary)", borderColor: "var(--border-primary)" }}>
                            <button onClick={() => { router.push(`/projects/${project.slug}`); setMenuOpen(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm th-text-secondary th-bg-hover"><Edit2 size={14} /> Mở dự án</button>
                            <button onClick={() => setDeleteTarget(project.id)} className="flex w-full items-center gap-2 px-3 py-2 text-sm th-bg-hover" style={{ color: "var(--danger)" }}><Trash2 size={14} /> Xoá</button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs th-text-muted" style={{ borderColor: "var(--border-primary)" }}>
                      <div className="flex gap-4"><span className="flex items-center gap-1.5"><Users size={13} /> Tài nguyên</span><span className="flex items-center gap-1.5"><Images size={13} /> Đầu ra</span></div>
                      <button onClick={() => router.push(`/projects/${project.slug}/studio`)} className="flex items-center gap-1.5 font-semibold text-blue-500 hover:text-blue-400">Mở Studio <ArrowRight size={13} /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Tạo dự án sáng tạo" size="md">
          <form onSubmit={handleCreate} className="space-y-4">
            <Input id="project-name" label="Tên dự án" placeholder='VD: "Campaign Thu Đông", "Bò và Gấu Finance"' value={newProject.name} onChange={(event) => setNewProject((project) => ({ ...project, name: event.target.value }))} required />
            <Textarea id="project-desc" label="Mục tiêu dự án" placeholder="Bạn muốn tạo loại nội dung gì và cho ai?" value={newProject.description} onChange={(event) => setNewProject((project) => ({ ...project, description: event.target.value }))} rows={2} />
            <Textarea id="project-style" label="Định hướng hình ảnh & giọng điệu" placeholder='VD: "Quiet luxury, ánh sáng tự nhiên, bảng màu than chì; copy gọn, tinh tế."' value={newProject.style_prompt} onChange={(event) => setNewProject((project) => ({ ...project, style_prompt: event.target.value }))} rows={3} />
            <div className="flex justify-end gap-3 pt-2"><Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Huỷ</Button><Button type="submit" loading={creating}>Tạo dự án</Button></div>
          </form>
        </Modal>

        <ConfirmModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Xoá dự án?"
          message="Toàn bộ tài nguyên, đầu ra và lịch sử tạo ảnh trong dự án sẽ bị xoá vĩnh viễn."
          confirmText="Xoá dự án"
          variant="danger"
        />
      </main>
    </div>
  );
}
