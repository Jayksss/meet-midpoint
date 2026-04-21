"use client";

import { useCallback, useMemo, useState } from "react";
import type { MapPoint } from "@/app/ui/KakaoMap";

/**
 * 【임시】서울시 대중교통환승경로(ws.bus.go.kr) 실험 UI
 * 제거 시: 이 파일 + app/api/seoul-transit/** + MeetMidpoint 의 import/JSX 만 삭제하면 됩니다.
 */

type PathMode = "subway" | "bus" | "busnsub";

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function toArray(v: unknown): unknown[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function summarizePathPayload(data: unknown): {
  headerCd?: string;
  headerMsg?: string;
  items: {
    distance?: string;
    time?: string;
    steps: { routeNm?: string; fname?: string; tname?: string }[];
  }[];
} {
  const root = asRecord(data);
  const sr = asRecord(root.ServiceResult ?? root.serviceResult);
  const msgHeader = asRecord(sr.msgHeader ?? sr.MsgHeader);
  const headerCd = String(msgHeader.headerCd ?? msgHeader.HEADER_CD ?? "");
  const headerMsg = String(msgHeader.headerMsg ?? msgHeader.HEADER_MSG ?? "");

  const msgBody = asRecord(sr.msgBody ?? sr.MsgBody);
  const rawList = msgBody.itemList ?? msgBody.ItemList;
  const itemsRaw = toArray(rawList);

  const items = itemsRaw.map((it) => {
    const item = asRecord(it);
    const distance = item.distance != null ? String(item.distance) : undefined;
    const time = item.time != null ? String(item.time) : undefined;
    const pl = item.pathList ?? item.PathList;
    const paths = toArray(pl).map((p) => {
      const pr = asRecord(p);
      return {
        routeNm: pr.routeNm != null ? String(pr.routeNm) : pr.routeNm === 0 ? "0" : undefined,
        fname: pr.fname != null ? String(pr.fname) : undefined,
        tname: pr.tname != null ? String(pr.tname) : undefined,
      };
    });
    return { distance, time, steps: paths };
  });

  return { headerCd, headerMsg, items };
}

export default function SeoulTransitExperimentPanel({
  selectedPoints,
  resultMidpoint,
}: {
  selectedPoints: MapPoint[];
  resultMidpoint: { lat: number; lng: number } | null;
}) {
  const [mode, setMode] = useState<PathMode>("busnsub");
  const [pair, setPair] = useState<"p12" | "p1mid">("p12");
  const [poiQuery, setPoiQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof summarizePathPayload> | null>(null);
  const [rawPreview, setRawPreview] = useState<string | null>(null);
  const [poiResult, setPoiResult] = useState<string | null>(null);

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

  const fetchPath = useCallback(async () => {
    setError(null);
    setSummary(null);
    setRawPreview(null);
    if (!startEnd) {
      setError("경로 조회를 위해 선택된 장소가 부족합니다. (1번→2번 또는 1번→중간은 중간지점 계산 후)");
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        mode,
        startX: startEnd.startX,
        startY: startEnd.startY,
        endX: startEnd.endX,
        endY: startEnd.endY,
      });
      const res = await fetch(`/api/seoul-transit/path?${qs.toString()}`);
      const json = (await res.json()) as { ok?: boolean; data?: unknown; error?: string; raw?: string };
      if (!res.ok) {
        setError(json.error ?? `요청 실패 (${res.status})`);
        if (json.raw) setRawPreview(json.raw);
        return;
      }
      const data = json.data;
      setRawPreview(JSON.stringify(data, null, 2).slice(0, 4000));
      setSummary(summarizePathPayload(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, [mode, startEnd]);

  const fetchPoi = useCallback(async () => {
    setPoiResult(null);
    setError(null);
    if (!poiQuery.trim()) {
      setError("POI 검색어를 입력하세요.");
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ stSrch: poiQuery.trim() });
      const res = await fetch(`/api/seoul-transit/location?${qs.toString()}`);
      const json = (await res.json()) as { ok?: boolean; data?: unknown; error?: string; raw?: string };
      if (!res.ok) {
        setError(json.error ?? `POI 요청 실패 (${res.status})`);
        if (json.raw) setRawPreview(json.raw);
        return;
      }
      setPoiResult(JSON.stringify(json.data, null, 2).slice(0, 4000));
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, [poiQuery]);

  return (
    <section className="mt-8 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-amber-900">【임시】서울시 대중교통환승경로 API</div>
          <p className="mt-1 text-xs leading-5 text-amber-950/80">
            활용가이드 기준 엔드포인트: <span className="font-mono">ws.bus.go.kr/api/rest/pathinfo</span> ·
            인증키는 서버 환경변수 <span className="font-mono">SEOUL_TRANSIT_SERVICE_KEY</span> 로만 전달합니다.
            이 블록은 통째로 삭제해도 됩니다.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-800">경로 조회 (좌표 기준)</div>
          <div className="mt-2 flex flex-col gap-2 text-xs text-zinc-600">
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-zinc-700">이동 수단</span>
              <select
                className="h-9 cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                value={mode}
                onChange={(e) => setMode(e.target.value as PathMode)}
              >
                <option value="busnsub">버스+지하철 환승 (getPathInfoByBusNSub)</option>
                <option value="subway">지하철만 (getPathInfoBySubway)</option>
                <option value="bus">버스만 (getPathInfoByBus)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-zinc-700">구간</span>
              <select
                className="h-9 cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                value={pair}
                onChange={(e) => setPair(e.target.value as "p12" | "p1mid")}
              >
                <option value="p12">선택 1번 → 선택 2번</option>
                <option value="p1mid" disabled={!resultMidpoint}>
                  선택 1번 → 직선평균 중간지점
                </option>
              </select>
            </label>
            <div className="rounded-lg bg-zinc-50 px-2 py-2 font-mono text-[11px] text-zinc-700">
              {startEnd ? (
                <>
                  <div>구간: {startEnd.label}</div>
                  <div className="mt-1">
                    startX={startEnd.startX}, startY={startEnd.startY}
                    <br />
                    endX={startEnd.endX}, endY={startEnd.endY}
                  </div>
                </>
              ) : (
                <span className="text-zinc-500">1·2번 장소를 먼저 선택하세요. (1→중간은 중간지점 찾기 후)</span>
              )}
            </div>
            <button
              type="button"
              className="mt-1 inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-amber-800 px-3 text-xs font-semibold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={fetchPath}
              disabled={loading || !startEnd}
            >
              {loading ? "조회 중…" : "환승경로 조회"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-800">출발지/목적지 명 검색 (getLocationInfo)</div>
          <div className="mt-2 flex flex-col gap-2">
            <input
              value={poiQuery}
              onChange={(e) => setPoiQuery(e.target.value)}
              placeholder="예: 광화문"
              className="h-9 rounded-lg border border-zinc-200 px-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
            />
            <button
              type="button"
              className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-amber-800 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={fetchPoi}
              disabled={loading}
            >
              POI 검색
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      ) : null}

      {summary ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-800">
          <div className="font-semibold text-zinc-900">요약</div>
          <div className="mt-1 text-zinc-600">
            headerCd: <span className="font-mono">{summary.headerCd || "(없음)"}</span> ·{" "}
            {summary.headerMsg || ""}
          </div>
          <ul className="mt-2 list-decimal space-y-2 pl-4">
            {summary.items.slice(0, 5).map((it, idx) => (
              <li key={idx}>
                <div>
                  거리: {it.distance ?? "-"} · 시간: {it.time ?? "-"} (단위는 API 응답 기준)
                </div>
                <ol className="mt-1 list-disc space-y-0.5 pl-4 text-zinc-600">
                  {it.steps.slice(0, 12).map((s, j) => (
                    <li key={j}>
                      {(s.routeNm ? `[${s.routeNm}] ` : "") +
                        (s.fname ?? "?") +
                        " → " +
                        (s.tname ?? "?")}
                    </li>
                  ))}
                  {it.steps.length > 12 ? <li>… 외 {it.steps.length - 12}구간</li> : null}
                </ol>
              </li>
            ))}
          </ul>
          {summary.items.length > 5 ? (
            <div className="mt-2 text-zinc-500">상위 5개 경로만 표시했습니다.</div>
          ) : null}
        </div>
      ) : null}

      {poiResult ? (
        <details className="mt-3 rounded-lg border border-zinc-200 bg-white p-2 text-xs">
          <summary className="cursor-pointer font-semibold text-zinc-800">POI 응답 (일부)</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-zinc-600">{poiResult}</pre>
        </details>
      ) : null}

      {rawPreview ? (
        <details className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 text-xs">
          <summary className="cursor-pointer font-semibold text-zinc-800">원본 JSON (앞부분)</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-zinc-600">{rawPreview}</pre>
        </details>
      ) : null}
    </section>
  );
}
