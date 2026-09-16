import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
  /** Nhãn cho trình đọc màn hình khi thẻ hoạt động như một nút. */
  ariaLabel?: string;
}

export default function Card({
  children,
  className = "",
  onClick,
  hover = false,
  ariaLabel,
}: CardProps) {
  // Một <div> có onClick thì chuột bấm được nhưng bàn phím thì không: không vào
  // được tab, không có Enter/Space, trình đọc màn hình cũng không biết đó là nút.
  // Chỉ gắn ngữ nghĩa nút khi thật sự có onClick, để thẻ tĩnh không biến thành
  // điểm dừng tab vô nghĩa.
  const interactive = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": ariaLabel,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              // Space cuộn trang nếu không chặn.
              event.preventDefault();
              onClick?.();
            },
          }
        : {})}
      className={`th-bg-card border th-border rounded-xl th-shadow-sm ${
        hover ? "hover:th-shadow-md cursor-pointer transition-all duration-200" : ""
      } ${interactive ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 th-ring-accent" : ""} ${className}`}
      style={{
        borderColor: "var(--border-primary)",
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 border-b ${className}`} style={{ borderColor: "var(--border-primary)" }}>{children}</div>;
}

export function CardContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}
