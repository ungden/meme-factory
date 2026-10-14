import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page";

export type MemeMode = "ai" | "manual" | "text" | "templates";

const MODES: { id: MemeMode; label: string; href: (ref: string) => string }[] = [
  { id: "ai", label: "AIDA làm", href: (ref) => `/projects/${ref}/generate` },
  { id: "manual", label: "Chỉnh tay", href: (ref) => `/projects/${ref}/generate?manual=1` },
  { id: "text", label: "Ghép chữ", href: (ref) => `/projects/${ref}/editor` },
  { id: "templates", label: "Mẫu meme", href: (ref) => `/projects/${ref}/templates` },
];

const DESCRIPTIONS: Record<MemeMode, ReactNode> = {
  ai: "Viết ý tưởng hoặc để trống, AIDA làm trọn meme rồi lưu vào Thư viện.",
  manual: "Bạn tự chọn chữ, nhân vật, khổ ảnh rồi bấm vẽ.",
  text: "Đặt chữ lên ảnh có sẵn. Không tốn điểm.",
  templates: "Ảnh dùng để ghép chữ. Thêm ảnh của bạn là dùng được ngay.",
};

/**
 * Một tiêu đề cho cả khu Meme. Ghép chữ và Mẫu meme vẫn là trang riêng, nhưng
 * trước đây mỗi trang một tiêu đề, một kiểu chữ, và từ Ghép chữ không có đường
 * nào quay về chỗ làm meme.
 */
export default function MemeAreaHeader({
  projectRef,
  mode,
  actions,
}: {
  projectRef: string;
  mode: MemeMode;
  actions?: ReactNode;
}) {
  return (
    <PageHeader title="Meme" description={DESCRIPTIONS[mode]} actions={actions}>
      <nav aria-label="Cách làm meme" className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex min-w-max gap-1 rounded-xl border p-1 th-border th-bg-card">
          {MODES.map((item) => {
            const active = item.id === mode;
            return (
              <Link
                key={item.id}
                href={item.href(projectRef)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors ${
                  active ? "th-bg-accent-light th-text-accent" : "th-text-secondary th-bg-hover"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {(mode === "ai" || mode === "manual") && (
        <p className="mt-3 text-sm th-text-tertiary">
          Chỉ cần đổi chữ trên ảnh có sẵn?{" "}
          <Link href={`/projects/${projectRef}/editor`} className="font-medium th-text-accent hover:underline">
            Dùng Ghép chữ
          </Link>
          , không tốn điểm.
        </p>
      )}
    </PageHeader>
  );
}
