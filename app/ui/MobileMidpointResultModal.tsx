"use client";

import { useEffect, useState } from "react";

type MidpointDetails = {
  address: string | null;
  nearestSubway: {
    name: string;
    address: string;
    distanceM: number | null;
  } | null;
};

export default function MobileMidpointResultModal({
  open,
  onClose,
  autoCloseSeconds,
  resultMidpoint,
  midpointDetails,
  notice,
}: {
  open: boolean;
  onClose: () => void;
  autoCloseSeconds: number;
  resultMidpoint: { lat: number; lng: number } | null;
  midpointDetails: MidpointDetails;
  notice?: string | null;
}) {
  const [remaining, setRemaining] = useState(autoCloseSeconds);

  useEffect(() => {
    if (!open) return;

    let left = autoCloseSeconds;
    queueMicrotask(() => setRemaining(left));

    const id = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(id);
        onClose();
        return;
      }
      setRemaining(left);
    }, 1000);

    return () => window.clearInterval(id);
  }, [open, autoCloseSeconds, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !resultMidpoint) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 px-3 pb-6 pt-12 sm:items-center sm:pb-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-result-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-100 px-4 pb-2 pt-4">
          <h2 id="mobile-result-title" className="text-lg font-semibold text-zinc-900">
            중간지점 결과
          </h2>
          <p className="mt-1 text-xs text-zinc-500">{remaining}초 후에 닫힙니다…</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-zinc-800">
          <div className="rounded-full bg-zinc-100 px-2 py-0.5 text-center text-[11px] font-mono text-zinc-600">
            midpoint: {resultMidpoint.lat.toFixed(5)}, {resultMidpoint.lng.toFixed(5)}
          </div>

          {notice ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              {notice}
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-1">
            <div className="text-xs font-semibold text-zinc-500">중간지점 주소</div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              {midpointDetails.address ?? (
                <span className="text-zinc-500">주소를 찾지 못했어요.</span>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <div className="text-xs font-semibold text-zinc-500">가장 가까운 지하철역</div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              {midpointDetails.nearestSubway ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-zinc-900">
                      {midpointDetails.nearestSubway.name}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600">{midpointDetails.nearestSubway.address}</div>
                </div>
              ) : (
                <span className="text-zinc-500">가까운 역을 찾지 못했어요.</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            className="h-11 w-full cursor-pointer rounded-xl bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-800"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
