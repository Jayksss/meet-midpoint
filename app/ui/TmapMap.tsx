"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SelectedPlace = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

export type MapPoint = SelectedPlace & { rowIndex: number };

const POINT_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0f766e"] as const;
const MIDPOINT_COLOR = "#16a34a";
const SUBWAY_COLOR = "#ef4444";
export const DEFAULT_MAP_CENTER = { lat: 37.4979, lng: 127.0276 } as const;
const START_MARKER_COLOR = "#52525b";
const TRANSIT_ROUTE_COLOR = "#0284c7";
const TRANSIT_MIDPOINT_COLOR = "#0ea5e9";
// “거리~동” 정도로 시작 (너무 확대되지 않게)
const DEFAULT_START_ZOOM = 13;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForTmapSdk() {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    if (typeof window !== "undefined" && window.Tmapv2?.Map) return;
    await sleep(50);
  }
}

function svgMarkerDataUrl(color: string, text: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle cx="15" cy="15" r="12" fill="${color}" stroke="#fff" stroke-width="2"/><text x="15" y="19" font-size="12" fill="white" text-anchor="middle" font-weight="800" font-family="system-ui,sans-serif">${text}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function fitMapToPoints(
  map: { fitBounds?: (b: unknown) => void; setCenter: (c: unknown) => void; setZoom: (z: number) => void },
  pts: { lat: number; lng: number }[],
  Tmapv2: NonNullable<typeof window.Tmapv2>
) {
  if (pts.length === 0) return;
  const bounds = new Tmapv2.LatLngBounds();
  for (const p of pts) bounds.extend(new Tmapv2.LatLng(p.lat, p.lng));
  if (typeof map.fitBounds === "function") {
    map.fitBounds(bounds);
    return;
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  map.setCenter(new Tmapv2.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2));
  map.setZoom(DEFAULT_START_ZOOM);
}

export default function TmapMap({
  points,
  midpoint,
  nearestSubway,
  showGangnamStartMarker,
  routeBetween12,
  routeMidpoint12,
}: {
  points: MapPoint[];
  midpoint: { lat: number; lng: number } | null;
  nearestSubway: { name: string; address: string; distanceM: number | null; lat: number; lng: number } | null;
  showGangnamStartMarker: boolean;
  /** 1↔2 TMAP 대중교통 경로 (있으면 해당 좌표로 표시, 일부 구간은 직선으로 보조) */
  routeBetween12: { lat: number; lng: number }[] | null;
  /** 1↔2 대중교통 경로상의 중간 지점(누적거리 50%) */
  routeMidpoint12: { lat: number; lng: number } | null;
}) {
  const domId = useId().replace(/:/g, "_");
  const mapId = `tmap_${domId}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ fitBounds?: (b: unknown) => void; setCenter: (c: unknown) => void; setZoom: (z: number) => void } | null>(null);
  const markersRef = useRef<{ setMap: (m: unknown | null) => void }[]>([]);
  const polylinesRef = useRef<{ setMap: (m: unknown | null) => void }[]>([]);
  const lastFitKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sdkPresent, setSdkPresent] = useState(false);
  const [sdkLoadError, setSdkLoadError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.__TMAP_SDK_LOAD_ERROR__ ?? null;
  });
  const [sdkLoadTimedOut, setSdkLoadTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await waitForTmapSdk();
      if (cancelled) return;
      if (!window.Tmapv2?.Map) return;
      setSdkPresent(true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      setSdkLoadError(window.__TMAP_SDK_LOAD_ERROR__ ?? null);
      if (!window.Tmapv2?.Map) setSdkLoadTimedOut(true);
    }, 11000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!containerRef.current) return;
    if (mapRef.current) return;
    const Tmapv2 = window.Tmapv2;
    if (!Tmapv2?.Map) return;
    containerRef.current.id = mapId;
    mapRef.current = new Tmapv2.Map(mapId, {
      center: new Tmapv2.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
      width: "100%",
      height: "520px",
      zoom: DEFAULT_START_ZOOM,
      https: true,
    });
    lastFitKeyRef.current = null;
  }, [ready, mapId]);

  useEffect(() => {
    if (!ready) return;
    const Tmapv2 = window.Tmapv2;
    const map = mapRef.current;
    if (!Tmapv2?.Map || !map) return;

    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
    for (const p of polylinesRef.current) p.setMap(null);
    polylinesRef.current = [];

    const addMarker = (pos: unknown, title: string, icon?: string) => {
      const base = { position: pos, map, title } as Record<string, unknown>;
      if (icon) {
        base.icon = icon;
        base.iconSize = { width: 30, height: 30 };
        base.offset = { x: 15, y: 30 };
      }
      markersRef.current.push(new Tmapv2.Marker(base as never));
    };

    if (showGangnamStartMarker) {
      addMarker(
        new Tmapv2.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
        "시작",
        svgMarkerDataUrl(START_MARKER_COLOR, "◎")
      );
    }

    if (points.length === 0) {
      // same 상태에서 반복 fitBounds 되면 사용자가 조정한 줌이 리셋됨
      const fitKey = JSON.stringify({
        empty: true,
        start: showGangnamStartMarker,
      });
      if (showGangnamStartMarker && lastFitKeyRef.current !== fitKey) {
        fitMapToPoints(map, [DEFAULT_MAP_CENTER], Tmapv2);
        lastFitKeyRef.current = fitKey;
      }
      return;
    }

    for (const p of points) {
      const pos = new Tmapv2.LatLng(p.lat, p.lng);
      const color = POINT_COLORS[p.rowIndex] ?? "#111827";
      addMarker(pos, `${p.rowIndex + 1}`, svgMarkerDataUrl(color, String(p.rowIndex + 1)));
    }

    const boundsPts: { lat: number; lng: number }[] = [...points];
    const sorted = [...points].sort((a, b) => a.rowIndex - b.rowIndex);
    const hasTransit =
      Boolean(routeBetween12 && routeBetween12.length >= 2) &&
      sorted.some((p) => p.rowIndex === 0) &&
      sorted.some((p) => p.rowIndex === 1);

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const is01 = a.rowIndex === 0 && b.rowIndex === 1;
      if (hasTransit && is01 && routeBetween12) {
        const path = routeBetween12.map((pt) => new Tmapv2.LatLng(pt.lat, pt.lng));
        polylinesRef.current.push(
          new Tmapv2.Polyline({
            path,
            strokeColor: TRANSIT_ROUTE_COLOR,
            strokeWeight: 5,
            strokeOpacity: 0.92,
            map,
            zIndex: 2,
          })
        );
        boundsPts.push(...routeBetween12);
      } else {
        const seg = [new Tmapv2.LatLng(a.lat, a.lng), new Tmapv2.LatLng(b.lat, b.lng)];
        polylinesRef.current.push(
          new Tmapv2.Polyline({
            path: seg,
            strokeColor: "#111827",
            strokeWeight: 4,
            strokeOpacity: 0.85,
            map,
            zIndex: 1,
          })
        );
      }
    }

    if (routeMidpoint12 && hasTransit) {
      boundsPts.push(routeMidpoint12);
      addMarker(
        new Tmapv2.LatLng(routeMidpoint12.lat, routeMidpoint12.lng),
        "경로 중간",
        svgMarkerDataUrl(TRANSIT_MIDPOINT_COLOR, "경")
      );
    }

    if (midpoint) {
      boundsPts.push(midpoint);
      addMarker(
        new Tmapv2.LatLng(midpoint.lat, midpoint.lng),
        "중간",
        svgMarkerDataUrl(MIDPOINT_COLOR, "중")
      );
    }

    if (nearestSubway) {
      boundsPts.push({ lat: nearestSubway.lat, lng: nearestSubway.lng });
      addMarker(
        new Tmapv2.LatLng(nearestSubway.lat, nearestSubway.lng),
        nearestSubway.name,
        svgMarkerDataUrl(SUBWAY_COLOR, "역")
      );
    }

    // same points/route로 인해 불필요하게 fitBounds가 재실행되면 사용자가 조정한 줌이 리셋됨
    const fitKey = JSON.stringify({
      p: sorted.map((p) => [p.rowIndex, +p.lat.toFixed(6), +p.lng.toFixed(6)]),
      routeN: routeBetween12 ? routeBetween12.length : 0,
      routeMid: routeMidpoint12
        ? [+routeMidpoint12.lat.toFixed(6), +routeMidpoint12.lng.toFixed(6)]
        : null,
      mid: midpoint ? [+midpoint.lat.toFixed(6), +midpoint.lng.toFixed(6)] : null,
      subway: nearestSubway ? [+nearestSubway.lat.toFixed(6), +nearestSubway.lng.toFixed(6)] : null,
      start: showGangnamStartMarker,
    });
    if (lastFitKeyRef.current !== fitKey) {
      fitMapToPoints(map, boundsPts, Tmapv2);
      lastFitKeyRef.current = fitKey;
    }
  }, [ready, points, midpoint, nearestSubway, showGangnamStartMarker, routeBetween12, routeMidpoint12]);

  return (
    <div className="w-full">
      {!sdkPresent ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
          <div className="font-semibold text-zinc-900">TMAP 지도 SDK가 로드되지 않았어요.</div>
          <div className="mt-2 leading-6">
            `.env.local`에{" "}
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">
              NEXT_PUBLIC_TMAP_APP_KEY
            </span>
            를 설정한 뒤 다시 실행해 주세요.
          </div>
          {sdkLoadError ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              SDK 스크립트 로드 에러: <span className="font-mono">{sdkLoadError}</span>
            </div>
          ) : null}
          {sdkLoadTimedOut ? (
            <div className="mt-2 text-xs text-zinc-600">
              10초 내에 <span className="font-mono">window.Tmapv2</span>가 생성되지 않았습니다. 브라우저 개발자도구
              Network에서{" "}
              <span className="font-mono">tmap/jsv2?version=1&amp;appKey=...</span> 요청이 200인지(또는 403인지)
              확인해 주세요. 403이면 SK Open API 콘솔에서 Web 도메인/리퍼러 허용 설정이 필요할 수 있습니다.
            </div>
          ) : null}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-[520px] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
        />
      )}
    </div>
  );
}
