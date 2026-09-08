import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    const base = "inline-flex min-h-10 items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

    const variants = {
      primary: "text-white th-ring-accent th-shadow-sm hover:opacity-90",
      secondary: "th-bg-tertiary th-text-primary hover:opacity-80 th-ring-accent",
      outline: "border th-border-secondary th-text-secondary th-bg-card hover:th-bg-hover th-ring-accent",
      ghost: "th-text-tertiary hover:th-text-primary th-bg-hover th-ring-accent",
      danger: "th-bg-danger text-white hover:opacity-90 th-ring-danger",
    };

    const sizes = {
      sm: "min-h-8 px-3 py-1 text-sm gap-1.5",
      md: "px-4 py-2 text-sm gap-2",
      lg: "min-h-11 px-5 py-2.5 text-base gap-2.5",
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        style={variant === "primary" ? { backgroundColor: "var(--accent)" } : undefined}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
