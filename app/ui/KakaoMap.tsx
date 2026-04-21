"use client";

import { useEffect, useRef, useState } from "react";

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
/** 지도 기본 중심(강남역) — 시작 마커와 초기 center 공통 */
export const DEFAULT_MAP_CENTER = { lat: 37.4979, lng: 127.0276 } as const;
const START_MARKER_COLOR = "#52525b";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForKakaoMapsReady() {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    if (typeof window !== "undefined" && window.kakao?.maps?.load) return;
    // SDK script 로딩 레이스 완화
    await sleep(50);
  }
}

export default function KakaoMap({
  points,
  midpoint,
  nearestSubway,
  showGangnamStartMarker,
}: {
  points: MapPoint[];
  midpoint: { lat: number; lng: number } | null;
  nearestSubway: { name: string; address: string; distanceM: number | null; lat: number; lng: number } | null;
  /** false 가 되면 강남역 기본 위치의 「시작」 마커를 제거 */
  showGangnamStartMarker: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoSetMap[]>([]);
  const polylineRef = useRef<KakaoSetMap | null>(null);
  const midpointMarkerRef = useRef<KakaoSetMap | null>(null);
  const subwayMarkerRef = useRef<KakaoSetMap | null>(null);
  const gangnamStartRef = useRef<KakaoSetMap | null>(null);
  const [ready, setReady] = useState(false);
  const [sdkPresent, setSdkPresent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await waitForKakaoMapsReady();
      if (cancelled) return;
      const kakao = window.kakao;
      if (!kakao?.maps?.load) return;
      setSdkPresent(true);
      kakao.maps.load(() => {
        if (cancelled) return;
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!containerRef.current) return;
    if (mapRef.current) return;
    const kakao = window.kakao!;
    const center = new kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng);
    mapRef.current = new kakao.maps.Map(containerRef.current, {
      center,
      level: 6,
    });
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!kakao?.maps || !map) return;

    gangnamStartRef.current?.setMap(null);
    gangnamStartRef.current = null;
    if (!showGangnamStartMarker) return;

    const CustomOverlay = kakao.maps.CustomOverlay;
    const pos = new kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng);
    if (CustomOverlay) {
      const el = document.createElement("div");
      el.style.minWidth = "40px";
      el.style.height = "30px";
      el.style.padding = "0 8px";
      el.style.borderRadius = "999px";
      el.style.background = START_MARKER_COLOR;
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.color = "white";
      el.style.fontWeight = "800";
      el.style.fontSize = "11px";
      el.style.boxShadow = "0 8px 18px rgba(0,0,0,0.18)";
      el.style.border = "2px solid rgba(255,255,255,0.95)";
      el.textContent = "시작";
      gangnamStartRef.current = new CustomOverlay({
        map,
        position: pos,
        content: el,
        xAnchor: 0.5,
        yAnchor: 1.0,
        zIndex: 2,
      });
    } else {
      gangnamStartRef.current = new kakao.maps.Marker({ map, position: pos });
    }

    return () => {
      gangnamStartRef.current?.setMap(null);
      gangnamStartRef.current = null;
    };
  }, [ready, showGangnamStartMarker]);

  useEffect(() => {
    if (!ready) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!kakao?.maps || !map) return;

    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    midpointMarkerRef.current?.setMap(null);
    midpointMarkerRef.current = null;
    subwayMarkerRef.current?.setMap(null);
    subwayMarkerRef.current = null;

    if (points.length === 0) return;

    const CustomOverlay = kakao.maps.CustomOverlay;
    const hasOverlay = Boolean(CustomOverlay);

    const path = points.map((p) => new kakao.maps.LatLng(p.lat, p.lng));
    for (const p of points) {
      const latLng = new kakao.maps.LatLng(p.lat, p.lng);
      const color = POINT_COLORS[p.rowIndex] ?? "#111827";
      if (hasOverlay && CustomOverlay) {
        const el = document.createElement("div");
        el.style.width = "28px";
        el.style.height = "28px";
        el.style.borderRadius = "999px";
        el.style.background = color;
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.color = "white";
        el.style.fontWeight = "800";
        el.style.fontSize = "13px";
        el.style.boxShadow = "0 8px 18px rgba(0,0,0,0.18)";
        el.style.border = "2px solid rgba(255,255,255,0.95)";
        el.textContent = String(p.rowIndex + 1);

        const overlay = new CustomOverlay({
          map,
          position: latLng,
          content: el,
          xAnchor: 0.5,
          yAnchor: 1.0,
          zIndex: 3,
        });
        markersRef.current.push(overlay);
      } else {
        const marker = new kakao.maps.Marker({ map, position: latLng });
        markersRef.current.push(marker);
      }
    }

    polylineRef.current = new kakao.maps.Polyline({
      map,
      path,
      strokeWeight: 4,
      strokeColor: "#111827",
      strokeOpacity: 0.85,
      strokeStyle: "solid",
    });

    if (midpoint) {
      const midLatLng = new kakao.maps.LatLng(midpoint.lat, midpoint.lng);
      if (hasOverlay && CustomOverlay) {
        const el = document.createElement("div");
        el.style.width = "34px";
        el.style.height = "34px";
        el.style.borderRadius = "999px";
        el.style.background = MIDPOINT_COLOR;
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.color = "white";
        el.style.fontWeight = "900";
        el.style.fontSize = "12px";
        el.style.boxShadow = "0 10px 24px rgba(0,0,0,0.22)";
        el.style.border = "3px solid rgba(255,255,255,0.95)";
        el.textContent = "중간";
        midpointMarkerRef.current = new CustomOverlay({
          map,
          position: midLatLng,
          content: el,
          xAnchor: 0.5,
          yAnchor: 1.0,
          zIndex: 5,
        });
      } else {
        midpointMarkerRef.current = new kakao.maps.Marker({
          map,
          position: midLatLng,
        });
      }
      path.push(midLatLng);
    }

    if (nearestSubway) {
      const subwayLatLng = new kakao.maps.LatLng(nearestSubway.lat, nearestSubway.lng);
      if (hasOverlay && CustomOverlay) {
        const el = document.createElement("div");
        el.style.width = "34px";
        el.style.height = "34px";
        el.style.borderRadius = "999px";
        el.style.background = SUBWAY_COLOR;
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.color = "white";
        el.style.fontWeight = "900";
        el.style.fontSize = "12px";
        el.style.boxShadow = "0 10px 24px rgba(0,0,0,0.22)";
        el.style.border = "3px solid rgba(255,255,255,0.95)";
        el.textContent = "역";
        subwayMarkerRef.current = new CustomOverlay({
          map,
          position: subwayLatLng,
          content: el,
          xAnchor: 0.5,
          yAnchor: 1.0,
          zIndex: 4,
        });
      } else {
        subwayMarkerRef.current = new kakao.maps.Marker({
          map,
          position: subwayLatLng,
        });
      }
      path.push(subwayLatLng);
    }

    const bounds = new kakao.maps.LatLngBounds();
    for (const latLng of path) bounds.extend(latLng);
    map.setBounds(bounds, 48, 48, 48, 48);
  }, [ready, points, midpoint, nearestSubway]);

  return (
    <div className="w-full">
      {!sdkPresent ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
          <div className="font-semibold text-zinc-900">카카오맵 SDK가 로드되지 않았어요.</div>
          <div className="mt-2 leading-6">
            `.env.local`에{" "}
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">
              NEXT_PUBLIC_KAKAO_MAP_APP_KEY
            </span>
            를 설정한 뒤 다시 실행해 주세요.
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-[520px] w-full rounded-2xl border border-zinc-200 bg-zinc-50"
        />
      )}
    </div>
  );
}

