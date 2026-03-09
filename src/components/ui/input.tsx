import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium th-text-secondary mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`w-full px-4 py-2.5 rounded-xl th-text-primary placeholder:th-text-muted focus:outline-none focus:ring-2 th-ring-accent transition-all border ${
            error
              ? "th-border-danger th-ring-danger"
              : "th-border"
          } ${className}`}
          style={{ background: "var(--bg-input)" }}
          {...props}
        />
        {error && <p className="mt-1 text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
