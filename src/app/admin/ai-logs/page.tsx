"use client";

import { useState, useCallback } from "react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Chip from "@/components/ui/chip";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { useDeferredTask } from "@/lib/use-deferred-task";
import { formatDateTime, formatNumber, formatPoints } from "@/lib/format";
import { aiType, signedTone, transactionStatus } from "@/components/admin/admin-labels";
import {
  Badge,
  EmptyRow,
  Pagination,
  SkeletonRows,
  TableCard,
  TableHead,
  TEXT_TONES,
  Th,
  adminFetch,
  readError,
} from "@/components/admin/admin-ui";

interface AILog {
  id: string;
  actor_user_id: string;
  user_email: string;
  amount: number;
  type: string;
  ai_type: string;
  project_name: string;
  output_kind?: string | null;
  output_id?: string | null;
  output_url?: string | null;
  output_title?: string | null;
  description: string;
  status: string;
  created_at: string;
}

const FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "character", label: "Nhân vật" },
  { value: "meme", label: "Meme" },
  { value: "background", label: "Ảnh nền" },
];

export default function AdminAILogsPage() {
  const [logs, setLogs] = useState<AILog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (typeFilter) params.set("type", typeFilter);
      const res = await adminFetch(`/api/admin/ai-logs?${params}`);
      if (!res.ok) throw new Error(await readError(res, "Chưa tải được lượt gọi AI."));
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa tải được lượt gọi AI.");
    }
    setLoading(false);
  }, [page, typeFilter]);

  useDeferredTask(fetchLogs);

  return (
    <PageContainer width="wide">
      <PageHeader title="Lượt gọi AI" description={`${formatNumber(total)} lượt vẽ ảnh, kèm điểm đã trừ và bài làm ra.`} />

      <div className="mb-6 flex flex-wrap gap-2" role="radiogroup" aria-label="Lọc theo loại">
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            role="radio"
            selected={typeFilter === f.value}
            onClick={() => {
              setTypeFilter(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      {error && (
        <Alert
          className="mb-4"
          action={
            <Button size="sm" variant="outline" onClick={fetchLogs}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <TableCard footer={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}>
        <TableHead>
          <Th>Thời gian</Th>
          <Th>Email</Th>
          <Th>Kênh</Th>
          <Th>Loại</Th>
          <Th>Bài làm ra</Th>
          <Th>Mô tả</Th>
          <Th>Trạng thái</Th>
          <Th align="right">Điểm</Th>
        </TableHead>
        <tbody>
          {loading ? (
            <SkeletonRows cols={8} />
          ) : logs.length === 0 ? (
            <EmptyRow cols={8}>Chưa có lượt gọi AI nào.</EmptyRow>
          ) : (
            logs.map((log) => {
              const type = aiType(log.ai_type);
              const status = transactionStatus(log.status);
              const amount = Number(log.amount);
              return (
                <tr key={log.id} className="border-t th-border">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs th-text-muted">{formatDateTime(log.created_at)}</td>
                  <td className="max-w-40 truncate px-4 py-2.5 text-xs th-text-primary">{log.user_email}</td>
                  <td className="max-w-40 truncate px-4 py-2.5 text-xs th-text-secondary">{log.project_name}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={type.tone}>{type.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs th-text-secondary">
                    {log.output_kind === "meme" ? (
                      <div className="max-w-56">
                        <p className="truncate">{log.output_title || "Meme"}</p>
                        {log.output_url ? (
                          <a href={log.output_url} target="_blank" rel="noreferrer" className="th-text-accent underline">
                            Xem bài
                          </a>
                        ) : (
                          <span className="th-text-muted">Không có đường dẫn</span>
                        )}
                      </div>
                    ) : log.output_kind ? (
                      <span>{log.output_kind}</span>
                    ) : (
                      <span className="th-text-muted">Chưa gắn bài</span>
                    )}
                  </td>
                  <td className="max-w-64 truncate px-4 py-2.5 text-xs th-text-secondary">{log.description}</td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-xs ${TEXT_TONES[status.tone]}`}>{status.label}</td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${TEXT_TONES[signedTone(amount)]}`}>
                    {formatPoints(Math.abs(amount))}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableCard>
    </PageContainer>
  );
}
