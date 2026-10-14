export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center rounded-xl font-medium tracking-[-0.01em] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:pointer-events-none aria-disabled:opacity-50 cursor-pointer";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "th-btn-primary th-ring-accent hover:brightness-110",
  secondary: "th-bg-tertiary th-text-primary hover:opacity-80 th-ring-accent",
  outline: "border th-border th-text-primary th-bg-card th-shadow-sm th-bg-hover th-ring-accent",
  ghost: "th-text-tertiary hover:th-text-primary th-bg-hover th-ring-accent",
  danger: "th-bg-danger th-text-on-primary hover:opacity-90 th-ring-danger",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1 text-sm gap-1.5",
  md: "min-h-10 px-4 py-2 text-sm gap-2",
  lg: "min-h-11 px-5 py-2.5 text-base gap-2.5",
};

/**
 * Lớp của nút, dùng được cho cả <Link>. Link trông như nút từng được viết tay ở
 * hàng chục chỗ, mỗi chỗ một chiều cao, một độ bo.
 */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = "") {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
}
