"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import KakaoMap, { type SelectedPlace } from "@/app/ui/KakaoMap";
import ProgressModal from "@/app/ui/ProgressModal";

type Suggestion = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

type RowState = {
  query: string;
  selected: SelectedPlace | null;
  suggestions: Suggestion[];
  open: boolean;
  loading: boolean;
};

type MidpointDetails = {
  address: string | null;
  nearestSubway:
    | {
        name: string;
        address: string;
        distanceM: number | null;
        lat: number;
        lng: number;
      }
    | null;
};

const MAX_TARGETS = 6;
const ROW_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0f766e"] as const;

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createInitialRows(): RowState[] {
  return Array.from({ length: MAX_TARGETS }, () => ({
    query: "",
    selected: null,
    suggestions: [],
    open: false,
    loading: false,
  }));
}

function midpointOf(points: { lat: number; lng: number }[]) {
  const n = points.length;
  if (n === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / n, lng: lng / n };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForKakaoServicesReady() {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    const services = window.kakao?.maps?.services;
    if (
      typeof window !== "undefined" &&
      services?.Places &&
      (services as { Geocoder?: unknown }).Geocoder
    )
      return;
    await sleep(50);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function pickString(rec: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}

function pickNumber(rec: Record<string, unknown>, key: string) {
  const v = rec[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return Number.NaN;
}

function normalizeSuggestion(item: unknown): Suggestion {
  const rec = asRecord(item);
  const label = pickString(rec, ["place_name", "address_name", "road_address_name"]);
  const address = pickString(rec, ["road_address_name", "address_name"]);
  const lat = pickNumber(rec, "y");
  const lng = pickNumber(rec, "x");
  return {
    id:
      typeof rec.id === "string" && rec.id.trim().length > 0
        ? rec.id
        : `${label}-${lat},${lng}`,
    label,
    address,
    lat,
    lng,
  };
}

async function keywordSearch(query: string): Promise<Suggestion[]> {
  await waitForKakaoServicesReady();
  const kakao = window.kakao;
  if (!kakao?.maps?.services?.Places) return [];

  return await new Promise((resolve) => {
    const places = new kakao.maps.services.Places();
    places.keywordSearch(
      query,
      (data: unknown[], status: string) => {
        if (status !== kakao.maps.services.Status.OK) return resolve([]);
        resolve(data.slice(0, 8).map(normalizeSuggestion));
      },
      { size: 8 }
    );
  });
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  await waitForKakaoServicesReady();
  const kakao = window.kakao;
  const Geocoder = kakao?.maps?.services?.Geocoder;
  if (!Geocoder) return null;

  return await new Promise((resolve) => {
    const geocoder = new Geocoder();
    geocoder.coord2Address(lng, lat, (result: unknown[], status: string) => {
      if (!kakao?.maps?.services) return resolve(null);
      if (status !== kakao.maps.services.Status.OK) return resolve(null);
      const first = result[0];
      const rec = asRecord(first);
      const road = asRecord(rec.road_address);
      const addr = asRecord(rec.address);
      const name =
        pickString(road, ["address_name"]) || pickString(addr, ["address_name"]) || null;
      resolve(name);
    });
  });
}

async function nearestSubwayStation(
  lat: number,
  lng: number
): Promise<MidpointDetails["nearestSubway"]> {
  await waitForKakaoServicesReady();
  const kakao = window.kakao;
  if (!kakao?.maps?.services?.Places) return null;

  const places = new kakao.maps.services.Places();
  const categorySearch = places.categorySearch;
  if (!categorySearch) return null;

  const sortByDistance = kakao.maps.services.SortBy?.DISTANCE;

  return await new Promise((resolve) => {
    categorySearch(
      "SW8",
      (data: unknown[], status: string) => {
        if (status !== kakao.maps.services.Status.OK) return resolve(null);
        const first = data[0];
        const rec = asRecord(first);
        const name = pickString(rec, ["place_name"]);
        const address = pickString(rec, ["road_address_name", "address_name"]);
        const distanceStr = pickString(rec, ["distance"]);
        const distanceM = distanceStr ? Number(distanceStr) : null;
        const stationLat = pickNumber(rec, "y");
        const stationLng = pickNumber(rec, "x");
        if (!name) return resolve(null);
        resolve({
          name,
          address,
          distanceM: Number.isFinite(distanceM) ? distanceM : null,
          lat: stationLat,
          lng: stationLng,
        });
      },
      {
        location: new kakao.maps.LatLng(lat, lng),
        radius: 5000,
        sort: sortByDistance,
        size: 1,
      }
    );
  });
}

export default function MeetMidpoint() {
  const [rows, setRows] = useState<RowState[]>(() => createInitialRows());
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("준비 중…");
  const [resultMidpoint, setResultMidpoint] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [midpointDetails, setMidpointDetails] = useState<MidpointDetails>({
    address: null,
    nearestSubway: null,
  });

  const requestIdRef = useRef(0);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const selectedPoints = useMemo(
    () =>
      rows.flatMap((r, idx) =>
        r.selected ? [{ ...r.selected, rowIndex: idx }] : []
      ) as (SelectedPlace & { rowIndex: number })[],
    [rows]
  );

  const canRun = selectedPoints.length >= 2 && !modalOpen;

  const onChangeQuery = useCallback((idx: number, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        query: value,
        selected: null,
        open: true,
        loading: value.trim().length >= 2,
      };
      return next;
    });
  }, []);

  const onPickSuggestion = useCallback((idx: number, s: Suggestion) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        query: s.label,
        selected: { id: s.id, label: s.label, address: s.address, lat: s.lat, lng: s.lng },
        suggestions: [],
        open: false,
        loading: false,
      };
      return next;
    });
  }, []);

  const clearRow = useCallback((idx: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], query: "", selected: null, suggestions: [], open: false };
      return next;
    });
  }, []);

  useEffect(() => {
    const active = rows
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.open && r.query.trim().length >= 2);
    if (active.length === 0) return;

    let cancelled = false;
    const localRequestId = ++requestIdRef.current;

    (async () => {
      for (const { r, idx } of active) {
        const q = r.query.trim();
        await sleep(200);
        if (cancelled) return;
        if (localRequestId !== requestIdRef.current) return;
        if (q !== rows[idx]?.query.trim()) continue;

        setRows((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], loading: true };
          return next;
        });

        const suggestions = await keywordSearch(q);
        if (cancelled) return;
        if (localRequestId !== requestIdRef.current) return;

        setRows((prev) => {
          const next = [...prev];
          if (next[idx].query.trim() !== q) return prev;
          next[idx] = {
            ...next[idx],
            suggestions,
            open: true,
            loading: false,
          };
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // rows 전체를 deps에 넣으면 타이핑 시 과도하게 재실행되므로, query/open만 추려서 감시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.open}:${r.query}`).join("|")]);

  const run = useCallback(async () => {
    setError(null);
    setResultMidpoint(null);
    setMidpointDetails({ address: null, nearestSubway: null });

    const points = rows.map((r) => r.selected).filter(Boolean) as SelectedPlace[];
    if (points.length < 2) {
      setError("최소 2개 이상의 장소를 선택해 주세요.");
      return;
    }

    setModalOpen(true);
    setModalMessage("장소 좌표를 수집 중…");
    await sleep(450);
    setModalMessage("중간지점을 계산 중…");
    await sleep(450);

    const mid = midpointOf(points);
    setResultMidpoint(mid);

    if (mid) {
      setModalMessage("중간지점 주소/가까운 역을 찾는 중…");
      const [address, nearestSubway] = await Promise.all([
        reverseGeocode(mid.lat, mid.lng),
        nearestSubwayStation(mid.lat, mid.lng),
      ]);
      setMidpointDetails({ address, nearestSubway });
      await sleep(250);
    }

    setModalMessage("지도에 표시하는 중…");
    await sleep(450);
    setModalMessage("완료!");
    await sleep(250);
    setModalOpen(false);
  }, [rows]);

  return (
    <div
      className="flex min-h-full flex-1 flex-col bg-zinc-50"
      onMouseDown={() =>
        setRows((prev) => prev.map((r) => ({ ...r, open: false })))
      }
    >
      <ProgressModal open={modalOpen} title="중간지점 찾는 중" message={modalMessage} />

      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
          <div>
            <div className="text-lg font-semibold text-zinc-900">중간지점 찾기</div>
            <div className="mt-1 text-sm text-zinc-600">
              최대 6개 장소를 입력하고 중간지점을 찾아요.
              <span className="mt-1 block text-xs text-zinc-500">
                지도는 기본으로 강남역을 중심으로 시작합니다.
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">대상 장소 (최대 6개)</div>
            <div className="mt-3 flex flex-col gap-3">
              {rows.map((row, idx) => (
                <div key={idx} className="relative">
                  <div className="flex items-center gap-2">
                    <div className="w-6 text-center text-xs font-semibold text-zinc-500">
                      {idx + 1}
                    </div>
                    <input
                      ref={idx === 0 ? firstInputRef : undefined}
                      value={row.query}
                      onChange={(e) => onChangeQuery(idx, e.target.value)}
                      onFocus={() =>
                        setRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], open: true };
                          return next;
                        })
                      }
                      placeholder="장소/주소 키워드 입력"
                      className={[
                        "h-10 w-full rounded-xl border px-3 text-sm text-zinc-900 outline-none",
                        row.selected
                          ? "focus:border-zinc-400"
                          : "border-zinc-200 bg-white focus:border-zinc-400",
                      ].join(" ")}
                      style={
                        row.selected
                          ? {
                              borderColor: hexToRgba(ROW_COLORS[idx] ?? "#111827", 0.55),
                              backgroundColor: hexToRgba(ROW_COLORS[idx] ?? "#111827", 0.06),
                            }
                          : undefined
                      }
                    />
                    <button
                      type="button"
                      className="h-10 shrink-0 cursor-pointer rounded-xl border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => clearRow(idx)}
                    >
                      지우기
                    </button>
                  </div>

                  {row.open ? (
                    <div
                      className="absolute left-8 right-0 top-[44px] z-10 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {row.query.trim().length < 2 ? (
                        <div className="px-3 py-2 text-xs text-zinc-500">
                          2글자 이상 입력하면 검색 결과가 나타나요.
                        </div>
                      ) : row.loading ? (
                        <div className="px-3 py-2 text-xs text-zinc-500">검색 중…</div>
                      ) : row.suggestions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-zinc-500">검색 결과 없음</div>
                      ) : (
                        <ul className="max-h-64 overflow-auto py-1">
                          {row.suggestions.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                className="w-full cursor-pointer px-3 py-2 text-left hover:bg-zinc-50"
                                onClick={() => onPickSuggestion(idx, s)}
                              >
                                <div className="text-sm font-semibold text-zinc-900">
                                  {s.label}
                                </div>
                                <div className="mt-0.5 text-xs text-zinc-500">{s.address}</div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}

                  {row.selected ? (
                    <div className="ml-8 mt-1">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: hexToRgba(ROW_COLORS[idx] ?? "#111827", 0.12),
                            color: ROW_COLORS[idx] ?? "#111827",
                          }}
                        >
                          선택됨
                        </span>
                        <span className="min-w-0 truncate text-xs font-semibold text-zinc-800">
                          {row.selected.label}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-zinc-500">
                        {row.selected.address}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              className="mt-4 inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={run}
              disabled={!canRun}
            >
              중간지점 찾기
            </button>

            <div className="mt-4 text-xs leading-6 text-zinc-500">
              최소 2개 이상의 장소를 선택해야 중간지점을 찾을 수 있어요.
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                <span className="font-semibold text-zinc-900">선택됨</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                  {selectedPoints.length}/{MAX_TARGETS}
                </span>
                {resultMidpoint ? (
                  <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    midpoint: {resultMidpoint.lat.toFixed(5)}, {resultMidpoint.lng.toFixed(5)}
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-zinc-500">
                    “중간지점 찾기”를 눌러 결과를 표시하세요.
                  </span>
                )}
              </div>
            </div>

            <KakaoMap
              points={selectedPoints}
              midpoint={resultMidpoint}
              nearestSubway={midpointDetails.nearestSubway}
            />

            {resultMidpoint ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="grid grid-cols-1 gap-3 text-sm text-zinc-800 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <div className="text-xs font-semibold text-zinc-500">중간지점 주소</div>
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                      {midpointDetails.address ?? (
                        <span className="text-zinc-500">주소를 찾지 못했어요.</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="text-xs font-semibold text-zinc-500">가장 가까운 지하철역</div>
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                      {midpointDetails.nearestSubway ? (
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="font-semibold text-zinc-900">
                            {midpointDetails.nearestSubway.name}
                          </div>
                          <div className="text-xs text-zinc-600">
                            {midpointDetails.nearestSubway.distanceM != null
                              ? `${Math.round(midpointDetails.nearestSubway.distanceM)}m`
                              : null}
                          </div>
                          <div className="w-full text-xs text-zinc-600">
                            {midpointDetails.nearestSubway.address}
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-500">가까운 역을 찾지 못했어요.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

