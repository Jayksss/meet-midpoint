"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapPoint } from "@/app/ui/mapTypes";
import { DEFAULT_MAP_CENTER } from "@/app/ui/mapTypes";

const POINT_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0f766e"] as const;
const START_MARKER_COLOR = "#52525b";
const TRANSIT_ROUTE_COLOR = "#0284c7";
// Kakao 지도 level: 숫자가 클수록 더 넓게(줌 아웃)
const DEFAULT_LEVEL = 7;
const MARKER_PX = 44;
const MARKER_OFFSET_X = Math.round(MARKER_PX / 2);
const MARKER_OFFSET_Y = MARKER_PX;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForKakaoSdk() {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    if (typeof window !== "undefined" && window.kakao?.maps?.load) return;
    await sleep(50);
  }
}

function svgMarkerDataUrl(color: string, text: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MARKER_PX}" height="${MARKER_PX}" viewBox="0 0 30 30"><circle cx="15" cy="15" r="12" fill="${color}" stroke="#fff" stroke-width="2"/><text x="15" y="19" font-size="12" fill="white" text-anchor="middle" font-weight="800" font-family="system-ui,sans-serif">${text}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function svgFlagMarkerDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MARKER_PX}" height="${MARKER_PX}" viewBox="0 0 48 48">
  <defs>
    <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>
  <g filter="url(#s)">
    <circle cx="24" cy="22" r="16" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
    <path d="M20 12c1 0 1.8.8 1.8 1.8V34a1.8 1.8 0 1 1-3.6 0V13.8c0-1 .8-1.8 1.8-1.8z" fill="#0f172a"/>
    <path d="M21.8 15h12.8c1 0 1.8.8 1.8 1.8v7.2c0 1-.8 1.8-1.8 1.8H21.8V15z" fill="#22c55e" stroke="#16a34a" stroke-width="1.2"/>
    <path d="M21.8 15c4.2 3.8 8.4 3.8 12.8 0" fill="none" stroke="#16a34a" stroke-width="1.2" opacity="0.8"/>
    <circle cx="34.6" cy="16.6" r="2.5" fill="#16a34a" stroke="#ffffff" stroke-width="1.2"/>
  </g>
  <path d="M24 44c6 0 11-4 11-4H13s5 4 11 4z" fill="#ffffff" opacity="0"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function svgSubwayMarkerDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MARKER_PX}" height="${MARKER_PX}" viewBox="0 0 48 48">
  <defs>
    <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>
  <g filter="url(#s)">
    <circle cx="24" cy="22" r="16" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
    <rect x="15" y="12" width="18" height="20" rx="6" fill="#ef4444" stroke="#b91c1c" stroke-width="1.2"/>
    <rect x="18" y="15" width="12" height="7" rx="2" fill="#fee2e2"/>
    <circle cx="20" cy="28" r="2.1" fill="#7f1d1d"/>
    <circle cx="28" cy="28" r="2.1" fill="#7f1d1d"/>
    <path d="M18 35l3.4-4.6h5.2L30 35" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20 24h8" stroke="#7f1d1d" stroke-width="2" stroke-linecap="round"/>
  </g>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function fitMapToPoints(
  map: { setBounds?: (b: unknown) => void; setCenter: (c: unknown) => void; setLevel: (l: number) => void },
  pts: { lat: number; lng: number }[],
  maps: NonNullable<NonNullable<typeof window.kakao>["maps"]>
) {
  if (pts.length === 0) return;
  const bounds = new maps.LatLngBounds();
  for (const p of pts) bounds.extend(new maps.LatLng(p.lat, p.lng));
  if (typeof map.setBounds === "function") {
    map.setBounds(bounds);
    return;
  }
  map.setCenter(new maps.LatLng(pts[0].lat, pts[0].lng));
  map.setLevel(DEFAULT_LEVEL);
}

export default function KakaoMap({
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ setBounds?: (b: unknown) => void; setCenter: (c: unknown) => void; setLevel: (l: number) => void } | null>(
    null
  );
  const markersRef = useRef<{ setMap: (m: unknown | null) => void }[]>([]);
  const polylinesRef = useRef<{ setMap: (m: unknown | null) => void }[]>([]);
  const lastFitKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sdkPresent, setSdkPresent] = useState(false);
  const [sdkLoadTimedOut, setSdkLoadTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await waitForKakaoSdk();
      if (cancelled) return;
      if (!window.kakao?.maps?.load) return;
      window.kakao.maps.load(() => {
        if (cancelled) return;
        setSdkPresent(true);
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      if (!window.kakao?.maps?.load) setSdkLoadTimedOut(true);
    }, 11000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!containerRef.current) return;
    if (mapRef.current) return;
    const maps = window.kakao?.maps;
    if (!maps?.Map) return;

    mapRef.current = new maps.Map(containerRef.current, {
      center: new maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
      level: DEFAULT_LEVEL,
    });
    lastFitKeyRef.current = null;
  }, [ready]);

  const sortedPoints = useMemo(() => [...points].sort((a, b) => a.rowIndex - b.rowIndex), [points]);

  useEffect(() => {
    if (!ready) return;
    const maps = window.kakao?.maps;
    const map = mapRef.current;
    if (!maps?.Map || !map) return;

    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
    for (const p of polylinesRef.current) p.setMap(null);
    polylinesRef.current = [];

    const addMarker = (lat: number, lng: number, iconUrl: string) => {
      const image = new maps.MarkerImage(iconUrl, new maps.Size(MARKER_PX, MARKER_PX), {
        offset: new maps.Point(MARKER_OFFSET_X, MARKER_OFFSET_Y),
      });
      const marker = new maps.Marker({
        position: new maps.LatLng(lat, lng),
        // @ts-expect-error kakao types are minimal; runtime supports image
        image,
      });
      marker.setMap(map as unknown);
      markersRef.current.push(marker);
    };

    const addPolyline = (path: { lat: number; lng: number }[], color: string, weight: number, opacity: number) => {
      if (path.length < 2) return;
      const polyline = new maps.Polyline({
        path: path.map((pt) => new maps.LatLng(pt.lat, pt.lng)),
        strokeColor: color,
        strokeWeight: weight,
        strokeOpacity: opacity,
        strokeStyle: "solid",
      });
      polyline.setMap(map as unknown);
      polylinesRef.current.push(polyline);
    };

    const boundsPts: { lat: number; lng: number }[] = [];

    if (showGangnamStartMarker) {
      boundsPts.push(DEFAULT_MAP_CENTER);
      addMarker(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng, svgMarkerDataUrl(START_MARKER_COLOR, "◎"));
    }

    for (const p of sortedPoints) {
      boundsPts.push({ lat: p.lat, lng: p.lng });
      const color = POINT_COLORS[p.rowIndex] ?? "#111827";
      addMarker(p.lat, p.lng, svgMarkerDataUrl(color, String(p.rowIndex + 1)));
    }

    const hasTransit =
      Boolean(routeBetween12 && routeBetween12.length >= 2) &&
      sortedPoints.some((p) => p.rowIndex === 0) &&
      sortedPoints.some((p) => p.rowIndex === 1);

    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const a = sortedPoints[i];
      const b = sortedPoints[i + 1];
      const is01 = a.rowIndex === 0 && b.rowIndex === 1;
      if (hasTransit && is01 && routeBetween12) {
        addPolyline(routeBetween12, TRANSIT_ROUTE_COLOR, 5, 0.92);
        boundsPts.push(...routeBetween12);
      } else {
        addPolyline(
          [
            { lat: a.lat, lng: a.lng },
            { lat: b.lat, lng: b.lng },
          ],
          "#111827",
          4,
          0.85
        );
      }
    }

    // 중간지점은 `midpoint`(대중교통 경로 기준)로만 표현

    if (midpoint) {
      boundsPts.push(midpoint);
      addMarker(midpoint.lat, midpoint.lng, svgFlagMarkerDataUrl());
    }

    if (nearestSubway) {
      boundsPts.push({ lat: nearestSubway.lat, lng: nearestSubway.lng });
      addMarker(nearestSubway.lat, nearestSubway.lng, svgSubwayMarkerDataUrl());
    }

    const fitKey = JSON.stringify({
      p: sortedPoints.map((p) => [p.rowIndex, +p.lat.toFixed(6), +p.lng.toFixed(6)]),
      routeN: routeBetween12 ? routeBetween12.length : 0,
      routeMid: routeMidpoint12 ? [+routeMidpoint12.lat.toFixed(6), +routeMidpoint12.lng.toFixed(6)] : null,
      mid: midpoint ? [+midpoint.lat.toFixed(6), +midpoint.lng.toFixed(6)] : null,
      subway: nearestSubway ? [+nearestSubway.lat.toFixed(6), +nearestSubway.lng.toFixed(6)] : null,
      start: showGangnamStartMarker,
    });
    if (lastFitKeyRef.current !== fitKey) {
      fitMapToPoints(map, boundsPts, maps);
      lastFitKeyRef.current = fitKey;
    }
  }, [ready, sortedPoints, midpoint, nearestSubway, showGangnamStartMarker, routeBetween12, routeMidpoint12]);

  return (
    <div className="w-full">
      {!sdkPresent ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
          <div className="font-semibold text-zinc-900">카카오 지도 SDK가 로드되지 않았어요.</div>
          <div className="mt-2 leading-6">
            `.env.local`에{" "}
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">
              NEXT_PUBLIC_KAKAO_MAP_APP_KEY
            </span>
            를 설정한 뒤 다시 실행해 주세요.
          </div>
          {sdkLoadTimedOut ? (
            <div className="mt-2 text-xs text-zinc-600">
              10초 내에 <span className="font-mono">window.kakao.maps</span>가 준비되지 않았습니다. 브라우저 개발자도구
              Network에서{" "}
              <span className="font-mono">/v2/maps/sdk.js?appkey=...</span> 요청이 200인지 확인해 주세요.
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

