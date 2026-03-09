"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useProject, useMemes } from "@/lib/use-store";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Modal from "@/components/ui/modal";
import ConfirmModal from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import { Download, Trash2, Image as ImageIcon, Calendar, Copy } from "lucide-react";
import type { MemeContent } from "@/types/database";

export default function GalleryPage() {
  const params = useParams();
  const projectId = params.id as string;
  const toast = useToast();

  const { project } = useProject(projectId);
  const { memes, loading, remove } = useMemes(projectId);
  const [selectedMeme, setSelectedMeme] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const selected = memes.find((m) => m.id === selectedMeme);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await remove(deleteTarget);
    toast.success("Đã xoá meme");
    if (selectedMeme === deleteTarget) setSelectedMeme(null);
    setDeleteTarget(null);
  };

  const handleDownload = (imageUrl: string | null, id: string) => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `meme-${id}.png`;
    link.click();
    toast.success("Đang tải xuống...");
  };

  const handleCopyCaption = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Đã sao chép caption");
    }).catch(() => {
      toast.error("Không thể sao chép");
    });
  };

  return (
    <div className="flex">
      <Sidebar projectId={projectId} projectName={project?.name} />
      <main className="ml-64 flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Thư viện</h1>
            <p className="th-text-tertiary mt-1">{memes.length} meme đã tạo</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="aspect-square th-bg-card rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : memes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 th-bg-card rounded-2xl flex items-center justify-center mb-4">
              <ImageIcon size={32} className="th-text-muted" />
            </div>
            <h3 className="text-lg font-medium th-text-secondary">Chưa có meme nào</h3>
            <p className="th-text-muted mt-1">Meme đã tạo sẽ xuất hiện ở đây</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {memes.map((meme) => {
              const content = meme.generated_content as MemeContent;
              return (
                <Card key={meme.id} hover onClick={() => setSelectedMeme(meme.id)} className="group overflow-hidden">
                  <div className="aspect-square relative overflow-hidden flex items-center justify-center" style={{ background: "var(--bg-tertiary)" }}>
                    {meme.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={meme.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-4">
                        <ImageIcon size={24} className="mx-auto th-text-muted mb-2" />
                        <p className="text-xs th-text-tertiary line-clamp-3">{content?.headline || meme.original_idea}</p>
                      </div>
                    )}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2" style={{ background: "var(--bg-overlay)" }}>
                      <button onClick={(e) => { e.stopPropagation(); handleDownload(meme.image_url, meme.id); }}
                        className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-colors">
                        <Download size={18} className="text-white" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(meme.id); }}
                        className="p-2 bg-red-500/30 rounded-xl hover:bg-red-500/50 transition-colors">
                        <Trash2 size={18} className="text-white" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs th-text-primary font-medium truncate">{content?.headline || meme.original_idea}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs th-text-muted flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(meme.created_at).toLocaleDateString("vi-VN")}
                      </span>
                      <span className="px-1.5 py-0.5 text-xs th-bg-tertiary th-text-tertiary rounded">{meme.format}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detail Modal */}
        <Modal isOpen={!!selected} onClose={() => setSelectedMeme(null)} title="Chi tiết meme" size="xl">
          {selected && (() => {
            const content = selected.generated_content as MemeContent;
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="th-bg-tertiary rounded-xl overflow-hidden flex items-center justify-center min-h-[200px]">
                  {selected.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.image_url} alt="" className="w-full h-auto" />
                  ) : (
                    <div className="text-center p-8">
                      <ImageIcon size={48} className="mx-auto th-text-muted mb-2" />
                      <p className="text-sm th-text-tertiary">{content?.headline}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs th-text-muted uppercase tracking-wider">Ý tưởng gốc</p>
                    <p className="text-sm th-text-secondary mt-1">{selected.original_idea}</p>
                  </div>
                  {content?.headline && (
                    <div>
                      <p className="text-xs th-text-muted uppercase tracking-wider">Headline</p>
                      <p className="text-lg font-bold th-text-primary mt-1">{content.headline}</p>
                    </div>
                  )}
                  {content?.caption && (
                    <div>
                      <p className="text-xs th-text-muted uppercase tracking-wider">Caption</p>
                      <p className="text-sm th-text-secondary mt-1">{content.caption}</p>
                      <Button variant="ghost" size="sm" className="mt-1" onClick={() => handleCopyCaption(content.caption || "")}>
                        <Copy size={12} /> Sao chép
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs th-text-tertiary">
                    <Calendar size={12} />
                    {new Date(selected.created_at).toLocaleString("vi-VN")}
                    <span className="px-1.5 py-0.5 th-bg-tertiary rounded">{selected.format}</span>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => handleDownload(selected.image_url, selected.id)}>
                      <Download size={14} /> Tải xuống
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDeleteTarget(selected.id)}>
                      <Trash2 size={14} /> Xoá
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>

        {/* Delete Confirmation */}
        <ConfirmModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Xoá meme?"
          message="Meme này sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
          confirmText="Xoá meme"
          variant="danger"
        />
      </main>
    </div>
  );
}
