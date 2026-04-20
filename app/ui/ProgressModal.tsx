"use client";

import { useEffect } from "react";

export default function ProgressModal({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 ${onClose ? "cursor-pointer" : "cursor-default"}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={() => onClose?.()}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-semibold text-zinc-900">{title}</div>
        <div className="mt-2 text-sm leading-6 text-zinc-600">{message}</div>
        <div className="mt-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-zinc-900" />
          </div>
        </div>
      </div>
    </div>
  );
}

