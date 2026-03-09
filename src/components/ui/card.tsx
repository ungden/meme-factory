import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export default function Card({ children, className = "", onClick, hover = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`th-bg-card border th-border rounded-2xl th-shadow-sm ${
        hover ? "hover:th-shadow-md cursor-pointer transition-all duration-200" : ""
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{
        borderColor: "var(--border-primary)",
        ...(hover ? {} : {}),
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
