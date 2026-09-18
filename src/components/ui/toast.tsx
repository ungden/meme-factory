"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { X, CheckCircle, AlertTriangle, Info, XCircle } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextType = {
    toast: addToast,
    success: (msg) => addToast("success", msg),
    error: (msg) => addToast("error", msg),
    warning: (msg) => addToast("warning", msg),
    info: (msg) => addToast("info", msg),
  };

  const icons = {
    success: <CheckCircle size={18} />,
    error: <XCircle size={18} />,
    warning: <AlertTriangle size={18} />,
    info: <Info size={18} />,
  };

  const styles = {
    success: { bg: "var(--success-light)", border: "var(--success)", color: "var(--success)" },
    error: { bg: "var(--danger-light)", border: "var(--danger)", color: "var(--danger)" },
    warning: { bg: "var(--warning-light)", border: "var(--warning)", color: "var(--warning)" },
    info: { bg: "var(--accent-light)", border: "var(--accent)", color: "var(--accent)" },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container */}
      {/* Trình đọc màn hình không thấy được toast nếu vùng chứa không tự báo.
          Người dùng bàn phím và người dùng trình đọc màn hình từng mất hoàn toàn
          các thông báo "đã lưu"/"lỗi" ở đây. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => {
          const s = styles[t.type];
          return (
            <div
              key={t.id}
              // Lỗi cần được đọc ngay, còn lại đọc khi trình đọc rảnh.
              role={t.type === "error" ? "alert" : undefined}
              className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-slide-in min-w-[300px] max-w-[420px]"
              style={{
                background: s.bg,
                borderColor: s.border,
                color: s.color,
              }}
            >
              {icons[t.type]}
              <p className="text-sm font-medium flex-1">{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                aria-label="Đóng thông báo"
                className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
