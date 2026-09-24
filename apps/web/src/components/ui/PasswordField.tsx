"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path strokeLinecap="round" d="M3 10s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
        <circle cx="10" cy="10" r="2.25" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path strokeLinecap="round" d="M3 10s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
      <path strokeLinecap="round" d="M4 4l12 12" />
    </svg>
  );
}

export const PasswordField = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function PasswordField({ className = "", id, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        id={inputId}
        type={visible ? "text" : "password"}
        className={`field pr-10 ${className}`.trim()}
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-slate-100 hover:text-ink-700 dark:hover:bg-white/10"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={inputId}
        aria-pressed={visible}
      >
        <EyeIcon open={!visible} />
      </button>
    </div>
  );
});
