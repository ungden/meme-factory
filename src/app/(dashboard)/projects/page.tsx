"use client";

import { useRouter } from "next/navigation";
import { useProjects, IS_MOCK_MODE } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Modal from "@/components/ui/modal";
import ConfirmModal from "@/components/ui/confirm-modal";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Plus, FolderOpen, Image, Users, MoreVertical, Trash2, Edit2, Zap } from "lucide-react";
import { useState } from "react";

export default function ProjectsPage() {
  const { projects, loading, create, remove } = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "", style_prompt: "" });
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const proj = await create({
      name: newProject.name,
      description: newProject.description || undefined,
      style_prompt: newProject.style_prompt || undefined,
    });
    if (proj) {
      setShowCreate(false);
      setNewProject({ name: "", description: "", style_prompt: "" });
      toast.success(`Đã tạo dự án "${proj.name}"`);
      router.push(`/projects/${proj.id}`);
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
      <main className="ml-0 md:ml-64 flex-1 p-4 pt-16 md:p-8">
        {/* Dev mode banner */}
        {IS_MOCK_MODE && (
          <div className="mb-6 px-4 py-3 border rounded-xl flex items-center gap-3 th-bg-accent-light th-border-accent">
            <Zap size={18} className="th-text-accent" />
            <p className="text-sm th-text-accent">
               <strong>Chế độ Dev</strong> — Đang chạy với dữ liệu mẫu. Kết nối database để go live.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Dự án của bạn</h1>
            <p className="th-text-tertiary mt-1">Quản lý các dự án meme cho fanpage</p>
          </div>
          <Button onClick={() => setShowCreate(true)} size="lg">
            <Plus size={18} />
            Tạo dự án mới
          </Button>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 th-bg-card rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 th-bg-card rounded-2xl flex items-center justify-center mb-4">
              <FolderOpen size={32} className="th-text-muted" />
            </div>
            <h3 className="text-lg font-medium th-text-secondary">Chưa có dự án nào</h3>
            <p className="th-text-muted mt-1 mb-5">Tạo dự án đầu tiên để bắt đầu</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} />
              Tạo dự án đầu tiên
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <Card
                key={project.id}
                hover
                onClick={() => router.push(`/projects/${project.id}`)}
                className="relative group"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center th-bg-accent-light">
                      <FolderOpen size={20} className="th-text-accent" />
                    </div>
                    <div className="relative">
                      <button
                        aria-label="Tuỳ chọn dự án"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(menuOpen === project.id ? null : project.id);
                        }}
                        className="p-1.5 th-text-muted hover:th-text-secondary rounded-lg th-bg-hover opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpen === project.id && (
                        <div className="absolute right-0 top-8 w-40 th-bg-tertiary th-border rounded-xl shadow-xl py-1 z-10" style={{ borderWidth: "1px", borderStyle: "solid" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/projects/${project.id}`);
                              setMenuOpen(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm th-text-secondary th-bg-hover"
                          >
                            <Edit2 size={14} /> Chỉnh sửa
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(project.id);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm th-bg-hover" style={{ color: "var(--danger)" }}
                          >
                            <Trash2 size={14} /> Xoá
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="text-base font-semibold th-text-primary mb-1">{project.name}</h3>
                  <p className="text-sm th-text-tertiary line-clamp-2 mb-4">
                    {project.description || "Chưa có mô tả"}
                  </p>

                  <div className="flex items-center gap-4 text-xs th-text-muted">
                    <span className="flex items-center gap-1">
                      <Users size={12} /> Nhân vật
                    </span>
                    <span className="flex items-center gap-1">
                      <Image size={12} /> Meme
                    </span>
                    <span>
                      {new Date(project.updated_at).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create Project Modal */}
        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Tạo dự án mới" size="md">
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              id="project-name"
              label="Tên dự án"
              placeholder='VD: "Bo va Gau Finance", "Tho Bay Mau Tech"'
              value={newProject.name}
              onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <Textarea
              id="project-desc"
              label="Mô tả"
              placeholder="Fanpage này về chủ đề gì?"
              value={newProject.description}
              onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
              rows={2}
            />
            <Textarea
              id="project-style"
              label="Phong cách AI"
              placeholder='VD: "Giọng hài hước, châm biếm nhẹ nhàng, dùng ngôn ngữ gen Z..."'
              value={newProject.style_prompt}
              onChange={(e) => setNewProject((p) => ({ ...p, style_prompt: e.target.value }))}
              rows={3}
            />
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
                Huỷ
              </Button>
              <Button type="submit" loading={creating}>
                Tạo dự án
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirmation */}
        <ConfirmModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Xoá dự án?"
          message="Tất cả nhân vật và meme trong dự án sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
          confirmText="Xoá dự án"
          variant="danger"
        />
      </main>
    </div>
  );
}
