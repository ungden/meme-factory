"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { buildPostText } from "@/lib/post-text";

type Props = {
  caption: string;
  hashtags?: string[];
  /** Nhãn hiển thị; mặc định "Sao chép bài". */
  label?: string;
  className?: string;
};

/**
 * Lấy bài đăng ra khỏi AIDA bằng một cú bấm.
 *
 * Chưa đăng thẳng lên fanpage được (còn chờ Meta duyệt ứng dụng), nhưng người
 * dùng không nên vì thế mà phải tự bôi đen từng dòng caption. Trên điện thoại,
 * Web Share API mở thẳng hộp chia sẻ của hệ điều hành — đường ngắn nhất sang
 * ứng dụng Facebook.
 */
export default function SharePost({ caption, hashtags = [], label = "Sao chép bài", className = "" }: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const text = buildPostText(caption, hashtags);

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Đã sao chép bài đăng. Dán thẳng vào Facebook nhé.");
    } catch {
      toast.error("Trình duyệt không cho sao chép. Bạn bôi đen và copy tay giúp nhé.");
    }
  }

  async function share() {
    try {
      await navigator.share({ text });
    } catch {
      // Người dùng đóng hộp chia sẻ — không phải lỗi, không cần báo gì.
    }
  }

  if (!text) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold th-text-accent"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Đã chép" : label}
      </button>
      {canShare && (
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center gap-1.5 text-xs font-semibold th-text-accent"
        >
          <Share2 size={14} /> Chia sẻ
        </button>
      )}
    </div>
  );
}
