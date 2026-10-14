"use client";

import { useState, useCallback } from "react";
import { Search, Users, Image as ImageIcon, Trash2 } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import ConfirmModal from "@/components/ui/confirm-modal";
import Input from "@/components/ui/input";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useDeferredTask } from "@/lib/use-deferred-task";
import { formatDate, formatNumber } from "@/lib/format";
import { EmptyRow, Pagination, SkeletonRows, TableCard, TableHead, Th, adminFetch, readError } from "@/components/admin/admin-ui";

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  user_id: string;
  user_email: string;
  characters_count: number;
  memes_count: number;
  created_at: string;
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      const res = await adminFetch(`/api/admin/projects?${params}`);
      if (!res.ok) throw new Error(await readError(res, "Chưa tải được danh sách kênh."));
      const data = await res.json();
      setProjects(data.projects ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa tải được danh sách kênh.");
    }
    setLoading(false);
  }, [page, search]);

  useDeferredTask(fetchProjects);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProjects();
  };

  const handleDeleteProject = async (project: ProjectRow) => {
    try {
      const res = await adminFetch(`/api/admin/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readError(res, "Chưa xoá được kênh. Thử lại nhé."));
        return;
      }
      toast.success(`Đã xoá kênh “${project.name}”`);
      fetchProjects();
    } catch {
      toast.error("Chưa xoá được kênh. Thử lại nhé.");
    }
  };

  return (
    <PageContainer width="wide">
      <PageHeader title="Kênh" description={`${formatNumber(total)} kênh trên hệ thống.`} />

      <form onSubmit={handleSearch} className="relative mb-6 max-w-md" role="search">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 th-text-muted" />
        <Input
          type="search"
          aria-label="Tìm kênh"
          placeholder="Tìm theo tên kênh…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 text-sm"
        />
      </form>

      {error && (
        <Alert
          className="mb-4"
          action={
            <Button size="sm" variant="outline" onClick={fetchProjects}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <TableCard footer={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}>
        <TableHead>
          <Th>Tên kênh</Th>
          <Th>Chủ kênh</Th>
          <Th align="center">Nhân vật</Th>
          <Th align="center">Meme</Th>
          <Th>Ngày tạo</Th>
          <Th align="right">
            <span className="sr-only">Thao tác</span>
          </Th>
        </TableHead>
        <tbody>
          {loading ? (
            <SkeletonRows cols={6} />
          ) : projects.length === 0 ? (
            <EmptyRow cols={6}>{search ? "Không có kênh nào khớp." : "Chưa có kênh nào."}</EmptyRow>
          ) : (
            projects.map((p) => (
              <tr key={p.id} className="border-t th-border">
                <td className="px-4 py-3">
                  <p className="font-medium th-text-primary">{p.name}</p>
                  {p.description && <p className="max-w-52 truncate text-xs th-text-muted">{p.description}</p>}
                </td>
                <td className="px-4 py-3 text-xs th-text-secondary">{p.user_email}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-xs th-text-secondary">
                    <Users size={12} aria-hidden /> {formatNumber(p.characters_count)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-xs th-text-secondary">
                    <ImageIcon size={12} aria-hidden /> {formatNumber(p.memes_count)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs th-text-muted">{formatDate(p.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" size="sm" onClick={() => setDeleteTarget(p)}>
                    <Trash2 size={14} /> Xoá
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void handleDeleteProject(target);
        }}
        title="Xoá kênh này?"
        message={`Kênh “${deleteTarget?.name ?? ""}” của ${deleteTarget?.user_email ?? ""} cùng mọi bài bên trong sẽ mất hẳn, không lấy lại được.`}
        confirmText="Xoá kênh"
        variant="danger"
      />
    </PageContainer>
  );
}
