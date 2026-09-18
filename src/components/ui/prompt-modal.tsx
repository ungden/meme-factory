"use client";

import { useState } from "react";
import Button from "./button";
import Input from "./input";
import Modal from "./modal";
import Textarea from "./textarea";

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Nhận giá trị đã cắt khoảng trắng; chỉ được gọi khi người dùng nhập gì đó. */
  onSubmit: (value: string) => void;
  title: string;
  /** Câu giải thích ngắn phía trên ô nhập. */
  message?: string;
  label: string;
  placeholder?: string;
  confirmText?: string;
  /** Câu trả lời dài (lý do, mô tả) thì dùng ô nhiều dòng. */
  multiline?: boolean;
  loading?: boolean;
}

/**
 * Hỏi người dùng một câu, thay cho `window.prompt`.
 *
 * `window.prompt` hiện tên miền như một cảnh báo bảo mật, không dịch được nút,
 * không theo giao diện sáng/tối, và trên vài trình duyệt di động thì bị chặn
 * thẳng — nghĩa là thao tác đó đơn giản là không làm được.
 */
export default function PromptModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  label,
  placeholder,
  confirmText = "Xác nhận",
  multiline = false,
  loading = false,
}: PromptModalProps) {
  const [value, setValue] = useState("");
  // Mỗi lần mở là một câu hỏi mới; giữ lại câu trả lời cũ chỉ gây nhầm. Chỉnh
  // state ngay trong lúc render theo đúng mẫu "điều chỉnh khi prop đổi" — dùng
  // effect ở đây sẽ tạo thêm một vòng render thừa cho mỗi lần mở.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setValue("");
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {message && <p className="text-sm th-text-secondary">{message}</p>}
        {multiline ? (
          <Textarea
            id="prompt-modal-value"
            label={label}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            rows={3}
            autoFocus
          />
        ) : (
          <Input
            id="prompt-modal-value"
            label={label}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button type="submit" loading={loading} disabled={!value.trim()}>
            {confirmText}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
