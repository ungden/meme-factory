import Link from "next/link";
import { FolderOpen } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--bg-primary)" }}>
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--accent-light)" }}>
          <FolderOpen size={32} style={{ color: "var(--accent)" }} />
        </div>
        <h2 className="text-xl font-bold th-text-primary mb-2">Không tìm thấy trang</h2>
        <p className="th-text-tertiary text-sm mb-6">
          Trang bạn đang tìm không tồn tại hoặc đã bị xoá.
        </p>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 px-6 py-3 th-bg-accent text-white font-semibold rounded-xl th-bg-accent-hover transition-all shadow-lg th-shadow-accent"
        >
          Về trang dự án
        </Link>
      </div>
    </div>
  );
}
