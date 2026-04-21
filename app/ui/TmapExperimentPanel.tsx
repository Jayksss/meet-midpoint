"use client";

import { useCallback, useMemo, useState } from "react";
import type { MapPoint } from "@/app/ui/TmapMap";

export default function TmapExperimentPanel({
  selectedPoints,
  resultMidpoint,
}: {
  selectedPoints: MapPoint[];
  resultMidpoint: { lat: number; lng: number } | null;
}) {
  const [pair, setPair] = useState<"p12" | "p1mid">("p12");
  const [poiQuery, setPoiQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const startEnd = useMemo(() => {
    const a = selectedPoints[0];
    const b = selectedPoints[1];
    if (!a || !b) return null;
    if (pair === "p12") {
      return {
        label: `${a.rowIndex + 1}번 → ${b.rowIndex + 1}번`,
        startX: String(a.lng),
        startY: String(a.lat),
        endX: String(b.lng),
        endY: String(b.lat),
      };
    }
    if (!resultMidpoint) return null;
    return {
      label: `${a.rowIndex + 1}번 → 직선평균 중간지점`,
      startX: String(a.lng),
      startY: String(a.lat),
      endX: String(resultMidpoint.lng),
      endY: String(resultMidpoint.lat),
    };
  }, [selectedPoints, pair, resultMidpoint]);

  const fetchTransit = useCallback(async () => {
    setError(null);
    setPreview(null);
    if (!startEnd) {
      setError("경로 조회를 위해 선택된 장소가 부족합니다.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/tmap/transit/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startX: startEnd.startX,
          startY: startEnd.startY,
          endX: startEnd.endX,
          endY: startEnd.endY,
          count: 1,
          lang: 0,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; data?: unknown; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `요청 실패 (${res.status})`);
        return;
      }
      setPreview(JSON.stringify(json.data, null, 2).slice(0, 6000));
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, [startEnd]);

  const fetchPoi = useCallback(async () => {
    setPreview(null);
    setError(null);
    if (!poiQuery.trim()) {
      setError("POI 검색어를 입력하세요.");
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ searchKeyword: poiQuery.trim(), count: "10" });
      const res = await fetch(`/api/tmap/pois?${qs}`);
      const json = (await res.json()) as { ok?: boolean; data?: unknown; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `POI 요청 실패 (${res.status})`);
        return;
      }
      setPreview(JSON.stringify(json.data, null, 2).slice(0, 6000));
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, [poiQuery]);

  return (
    <section className="mt-8 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/40 p-4">
      <div className="text-sm font-bold text-sky-950">TMAP API 실험 패널</div>
      <p className="mt-1 text-xs leading-5 text-sky-950/85">
        서버 프록시: <span className="font-mono">/api/tmap/transit/routes</span>,{" "}
        <span className="font-mono">/api/tmap/pois</span> · 키는{" "}
        <span className="font-mono">TMAP_APP_KEY</span> 또는{" "}
        <span className="font-mono">NEXT_PUBLIC_TMAP_APP_KEY</span>
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-sky-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-800">대중교통 경로 (POST)</div>
          <label className="mt-2 flex flex-col gap-1 text-xs text-zinc-600">
            <span className="font-semibold text-zinc-700">구간</span>
            <select
              className="h-9 cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
              value={pair}
              onChange={(e) => setPair(e.target.value as "p12" | "p1mid")}
            >
              <option value="p12">1번 → 2번</option>
              <option value="p1mid" disabled={!resultMidpoint}>
                1번 → 중간지점 (중간지점 계산 후)
              </option>
            </select>
          </label>
          <button
            type="button"
            className="mt-3 h-9 w-full rounded-lg bg-sky-700 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            onClick={fetchTransit}
            disabled={loading || !startEnd}
          >
            {loading ? "요청 중…" : "경로 조회"}
          </button>
        </div>

        <div className="rounded-xl border border-sky-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-800">장소 통합 검색 (GET)</div>
          <input
            className="mt-2 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm"
            value={poiQuery}
            onChange={(e) => setPoiQuery(e.target.value)}
            placeholder="검색어"
          />
          <button
            type="button"
            className="mt-2 h-9 w-full rounded-lg bg-zinc-800 text-sm font-semibold text-white hover:bg-zinc-900 disabled:opacity-50"
            onClick={fetchPoi}
            disabled={loading}
          >
            POI 검색
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {preview ? (
        <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-zinc-200 bg-zinc-900 p-3 text-[11px] text-zinc-100">
          {preview}
        </pre>
      ) : null}
    </section>
  );
}
