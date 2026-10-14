"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Send, Trash2, Eye, EyeOff, Bell, Coins } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Chip from "@/components/ui/chip";
import ConfirmModal from "@/components/ui/confirm-modal";
import EmptyState from "@/components/ui/empty-state";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import { PageContainer, PageHeader, Skeleton } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatNumber, formatPoints } from "@/lib/format";
import { POINT_COSTS, POINT_PACKAGES, checkMargin } from "@/lib/point-pricing";
import {
  AI_PRICE_MARKUP_PERCENT,
  AI_PRICING_CATALOG,
  AI_PRICING_EFFECTIVE_DATE,
  AI_PRICING_SOURCES,
  estimateImageGenerationPrice,
} from "@/lib/ai-pricing";
import type { BadgeTone } from "@/components/admin/admin-labels";
import { Badge, adminFetch, readError } from "@/components/admin/admin-ui";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
  created_at: string;
}

// Tông màu khớp với AnnouncementBanner mà người dùng sẽ thấy.
const ANNOUNCEMENT_TYPES: { value: string; label: string; tone: BadgeTone }[] = [
  { value: "info", label: "Thông tin", tone: "accent" },
  { value: "warning", label: "Cảnh báo", tone: "warning" },
  { value: "success", label: "Tin vui", tone: "success" },
  { value: "promo", label: "Khuyến mãi", tone: "accent" },
];

const PRICED_ACTIONS = [
  { key: "content" as const, label: "Viết chữ", current: POINT_COSTS.content },
  { key: "character" as const, label: "Vẽ ảnh nhân vật (1K)", current: POINT_COSTS.character },
  { key: "background" as const, label: "Vẽ ảnh nền (2K)", current: POINT_COSTS.background },
  { key: "meme" as const, label: "Vẽ ảnh meme / góc máy (1K)", current: POINT_COSTS.meme },
];

const PROVIDER_PRICE_ROWS = AI_PRICING_CATALOG.map((item) => ({
  ...item,
  quote: estimateImageGenerationPrice({
    model: item.model,
    resolution: item.resolution,
    quality: item.quality,
  }),
}));

export default function AdminSettingsPage() {
  const toast = useToast();

  const [pointCosts, setPointCosts] = useState({
    content: POINT_COSTS.content,
    character: POINT_COSTS.character,
    background: POINT_COSTS.background,
    meme: POINT_COSTS.meme,
  });
  const [savingPricing, setSavingPricing] = useState(false);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("info");
  const [creatingAnn, setCreatingAnn] = useState(false);
  const [loadingAnn, setLoadingAnn] = useState(true);
  const [annError, setAnnError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/settings");
      const data = await res.json();
      if (data.settings?.point_costs) {
        setPointCosts(data.settings.point_costs);
      }
    } catch { /* giữ giá mặc định trong code */ }
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    setLoadingAnn(true);
    setAnnError(null);
    try {
      const res = await adminFetch("/api/admin/announcements");
      if (!res.ok) throw new Error(await readError(res, "Chưa tải được danh sách thông báo."));
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
    } catch (err) {
      setAnnError(err instanceof Error ? err.message : "Chưa tải được danh sách thông báo.");
    }
    setLoadingAnn(false);
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchAnnouncements();
  }, [fetchSettings, fetchAnnouncements]);

  const savePricing = async () => {
    setSavingPricing(true);
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "point_costs", value: pointCosts }),
      });
      if (!res.ok) throw new Error(await readError(res, "Chưa lưu được giá. Thử lại nhé."));
      toast.success("Đã lưu giá điểm");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chưa lưu được giá. Thử lại nhé.");
    }
    setSavingPricing(false);
  };

  const createAnnouncement = async () => {
    if (!newTitle.trim()) return;
    setCreatingAnn(true);
    try {
      const res = await adminFetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim(), type: newType }),
      });
      if (!res.ok) throw new Error(await readError(res, "Chưa đăng được thông báo. Thử lại nhé."));
      toast.success("Đã đăng thông báo");
      setNewTitle("");
      setNewContent("");
      fetchAnnouncements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chưa đăng được thông báo. Thử lại nhé.");
    }
    setCreatingAnn(false);
  };

  const toggleAnnouncement = async (id: string, is_active: boolean) => {
    try {
      const res = await adminFetch("/api/admin/announcements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active }),
      });
      if (!res.ok) throw new Error(await readError(res, "Chưa đổi được thông báo. Thử lại nhé."));
      fetchAnnouncements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chưa đổi được thông báo. Thử lại nhé.");
    }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      const res = await adminFetch(`/api/admin/announcements?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Chưa xoá được thông báo. Thử lại nhé."));
      toast.success("Đã xoá thông báo");
      fetchAnnouncements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chưa xoá được thông báo. Thử lại nhé.");
    }
  };

  return (
    <PageContainer width="wide">
      <PageHeader title="Cấu hình" description="Giá điểm theo tính năng và thông báo cho người dùng." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold th-text-primary">
            <Coins size={16} className="th-text-warning" />
            Giá điểm theo tính năng
          </h2>
          <div className="space-y-4">
            {PRICED_ACTIONS.map((item) => {
              const margin = item.key === "content" ? null : checkMargin(item.key, pointCosts[item.key]);
              return (
                <div key={item.key} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`price-${item.key}`} className="text-sm th-text-primary">
                      {item.label}
                    </label>
                    <p className="text-xs th-text-muted">Mặc định: {formatPoints(item.current)}</p>
                    {margin && (
                      <p className={`text-xs ${margin.coversCost ? "th-text-muted" : "th-text-danger"}`}>
                        Chi phí xấu nhất {formatNumber(margin.worstCostVnd)}đ · biên {margin.marginMultiplier.toFixed(2)}x
                        {margin.coversCost
                          ? margin.meetsTarget
                            ? ""
                            : ` · dưới mục tiêu +${AI_PRICE_MARKUP_PERCENT}%, nên từ ${formatPoints(margin.minimumPoints)}`
                          : ` · lỗ, tối thiểu ${formatPoints(margin.minimumPoints)}`}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="w-24">
                      <Input
                        id={`price-${item.key}`}
                        type="number"
                        min={0}
                        value={pointCosts[item.key]}
                        onChange={(e) => setPointCosts((prev) => ({ ...prev, [item.key]: parseInt(e.target.value) || 0 }))}
                        className="text-center text-sm"
                      />
                    </div>
                    <span className="text-xs th-text-muted">điểm</span>
                  </div>
                </div>
              );
            })}

            <div className="border-t pt-3 th-border">
              <Button onClick={savePricing} loading={savingPricing} className="w-full">
                <Save size={16} /> Lưu giá
              </Button>
              <p className="mt-2 text-center text-xs th-text-muted">
                Giá lưu ở đây có hiệu lực ngay. Hệ thống từ chối mức giá thấp hơn chi phí thật xấu nhất của hành động đó.
              </p>
            </div>
          </div>

          <div className="mt-6 border-t pt-4 th-border">
            <h3 className="mb-3 text-xs font-semibold th-text-muted">Gói nạp hiện tại</h3>
            <div className="space-y-2">
              {POINT_PACKAGES.map((pkg) => (
                <div key={pkg.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span className="flex items-center gap-1.5 th-text-secondary">
                    {pkg.name}
                    {pkg.popular && <Badge tone="accent">Phổ biến</Badge>}
                  </span>
                  <span className="font-medium th-text-primary">
                    {formatPoints(pkg.points)} / {formatNumber(pkg.price)}đ
                    {pkg.bonus && <span className="ml-1 th-text-muted">({pkg.bonus})</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 border-t pt-4 th-border">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold th-text-muted">Giá gốc của provider</h3>
                <p className="mt-1 text-xs th-text-muted">
                  Standard API · cập nhật {AI_PRICING_EFFECTIVE_DATE} · thu giá vốn +{AI_PRICE_MARKUP_PERCENT}%
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <a className="th-text-accent" href={AI_PRICING_SOURCES.google} target="_blank" rel="noreferrer">Google</a>
                <a className="th-text-accent" href={AI_PRICING_SOURCES.openai} target="_blank" rel="noreferrer">OpenAI</a>
              </div>
            </div>
            <div className="space-y-2">
              {PROVIDER_PRICE_ROWS.map((item) => (
                <div key={item.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                  <span className="th-text-secondary">{item.label}</span>
                  <span className="whitespace-nowrap font-medium th-text-primary">
                    ${item.quote.outputCostUsd.toFixed(4)} → từ {formatPoints(item.quote.customerPoints)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs th-text-muted">
              Giá “từ” chưa gồm ảnh mẫu và prompt. Mức giá theo tính năng phía trên đã tính dư cho phần đầu vào lớn nhất
              của cách làm hiện tại.
            </p>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold th-text-primary">
              <Bell size={16} className="th-text-accent" />
              Thông báo mới
            </h2>
            <div className="space-y-3">
              <Input
                aria-label="Tiêu đề thông báo"
                placeholder="Tiêu đề thông báo…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="text-sm"
              />
              <Textarea
                aria-label="Nội dung thông báo"
                placeholder="Nội dung chi tiết (không bắt buộc)…"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Loại thông báo">
                {ANNOUNCEMENT_TYPES.map((t) => (
                  <Chip key={t.value} role="radio" selected={newType === t.value} onClick={() => setNewType(t.value)}>
                    {t.label}
                  </Chip>
                ))}
              </div>
              <Button onClick={createAnnouncement} loading={creatingAnn} disabled={!newTitle.trim()} className="w-full">
                <Send size={16} /> Đăng thông báo
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-sm font-semibold th-text-primary">Danh sách thông báo</h2>
            {loadingAnn ? (
              <div className="space-y-3" role="status" aria-label="Đang tải">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : annError ? (
              <Alert
                action={
                  <Button size="sm" variant="outline" onClick={fetchAnnouncements}>
                    Thử lại
                  </Button>
                }
              >
                {annError}
              </Alert>
            ) : announcements.length === 0 ? (
              <EmptyState icon={Bell} title="Chưa có thông báo" hint="Thông báo đăng ở trên sẽ hiện cho mọi người dùng." />
            ) : (
              <div className="space-y-3">
                {announcements.map((ann) => {
                  const typeStyle = ANNOUNCEMENT_TYPES.find((t) => t.value === ann.type) || ANNOUNCEMENT_TYPES[0];
                  return (
                    <div
                      key={ann.id}
                      className={`rounded-xl border p-4 transition-all th-border ${ann.is_active ? "" : "opacity-50"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge tone={typeStyle.tone}>{typeStyle.label}</Badge>
                            <span className={`text-xs ${ann.is_active ? "th-text-accent" : "th-text-muted"}`}>
                              {ann.is_active ? "Đang hiện" : "Đã ẩn"}
                            </span>
                          </div>
                          <p className="text-sm font-medium th-text-primary">{ann.title}</p>
                          {ann.content && <p className="mt-0.5 text-xs th-text-secondary">{ann.content}</p>}
                          <p className="mt-1 text-xs th-text-muted">{formatDateTime(ann.created_at)}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleAnnouncement(ann.id, !ann.is_active)}
                            aria-label={ann.is_active ? "Ẩn thông báo" : "Hiện thông báo"}
                            title={ann.is_active ? "Ẩn" : "Hiện"}
                          >
                            {ann.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(ann)}
                            aria-label="Xoá thông báo"
                            title="Xoá"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void deleteAnnouncement(target.id);
        }}
        title="Xoá thông báo này?"
        message={`Thông báo “${deleteTarget?.title ?? ""}” sẽ mất hẳn, không lấy lại được. Muốn tạm tắt thì bấm Ẩn.`}
        confirmText="Xoá thông báo"
        variant="danger"
      />
    </PageContainer>
  );
}
