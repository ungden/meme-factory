"use client";

import type { ReactNode } from "react";

export function ControlRow({ label, value, children }: { label: string; value?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium th-text-tertiary">{label}</span>
        {value !== undefined && (
          <span className="text-xs tabular-nums th-text-secondary px-1.5 py-0.5 rounded th-bg-tertiary">{value}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  ariaLabel,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-blue-600 cursor-pointer"
    />
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ControlRow label={label}>
      <div className="flex items-center gap-2 rounded-lg border th-border-secondary px-2 py-1.5">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value.toUpperCase()}
          onChange={(event) => {
            const next = event.target.value.trim();
            if (/^#[0-9a-fA-F]{0,6}$/.test(next)) onChange(next);
          }}
          className="w-full bg-transparent text-xs th-text-primary outline-none"
        />
      </div>
    </ControlRow>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-xs font-medium th-text-tertiary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-blue-600" : "th-bg-tertiary"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex items-center justify-center rounded-lg border px-2 py-1.5 text-xs transition-colors ${
            value === option.value
              ? "border-blue-600 text-blue-600 bg-blue-600/10"
              : "th-border-secondary th-text-tertiary th-bg-hover"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
