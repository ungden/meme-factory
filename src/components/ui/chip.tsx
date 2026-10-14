import { ButtonHTMLAttributes, forwardRef } from "react";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Đang được chọn. */
  selected?: boolean;
}

/** Nút chọn nhỏ hình viên thuốc: chọn kiểu, gắn nhân vật, lọc danh sách. */
const Chip = forwardRef<HTMLButtonElement, ChipProps>(({ selected = false, className = "", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-pressed={props.role === "radio" ? undefined : selected}
    aria-checked={props.role === "radio" ? selected : undefined}
    className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 th-ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
      selected ? "th-border-accent th-bg-accent-light th-text-accent" : "th-border th-text-secondary th-bg-hover"
    } ${className}`}
    {...props}
  />
));

Chip.displayName = "Chip";
export default Chip;
