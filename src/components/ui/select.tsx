import { SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

/** Ô chọn cùng kiểu với Input; trước đây mỗi màn tự vẽ một kiểu select. */
const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className = "", label, id, children, ...props }, ref) => (
  <div className="w-full">
    {label && (
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium th-text-secondary">
        {label}
      </label>
    )}
    <div className="relative">
      <select
        ref={ref}
        id={id}
        className={`w-full appearance-none rounded-xl border py-2.5 pl-4 pr-10 th-bg-input th-border th-text-primary transition-all focus:outline-none focus-visible:ring-2 th-ring-accent ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 th-text-tertiary" />
    </div>
  </div>
));

Select.displayName = "Select";
export default Select;
