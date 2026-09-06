"use client";

import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export default function Modal({ isOpen, onClose, title, children, size = "md" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else {
      if (previousOverflowRef.current !== null) document.body.style.overflow = previousOverflowRef.current;
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
    return () => {
      if (previousOverflowRef.current !== null) document.body.style.overflow = previousOverflowRef.current;
    };
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap and return focus to the trigger after close.
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      const first = dialogRef.current.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      (first ?? dialogRef.current).focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="fixed inset-0 backdrop-blur-sm" style={{ background: "var(--bg-overlay)" }} onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative w-full ${sizes[size]} rounded-2xl th-shadow-lg border outline-none`}
        style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--border-primary)" }}>
          <h2 id="modal-title" className="text-lg font-semibold th-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 th-text-tertiary rounded-lg transition-colors cursor-pointer th-bg-hover"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
