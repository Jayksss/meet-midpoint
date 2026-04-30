"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import KakaoMap from "@/app/ui/KakaoMap";
import type {SelectedPlace} from "@/app/ui/mapTypes";
import {parseTmapTransitPath, pickTmapTransitSummary} from "@/lib/tmap-transit-path-parse";
import ProgressModal from "@/app/ui/ProgressModal";
import MobileMidpointResultModal from "@/app/ui/MobileMidpointResultModal";

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

const MAX_TARGETS = 2;
/** 모바일 판별·결과 모달 자동 닫힘 (max-width 기준은 Tailwind md 미만과 맞춤) */
const MOBILE_MAX_WIDTH_PX = 768;
const MOBILE_RESULT_AUTO_CLOSE_SEC = 10;
const ROW_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0f766e"] as const;

function isMobileViewport(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
}

/** 로컬·개발에서만 1·2번 입력칸에 넣는 데모 검색어 */
const DEV_DEMO_QUERY_1 = "을지로3가역 2호선";
const DEV_DEMO_QUERY_2 = "가산디지털단지역 1호선";

/** `npm run dev` 또는 배포 개발 환경(NEXT_PUBLIC_APP_ENV) */
function isLocalOrDevLikeEnv(): boolean {
    if (process.env.NODE_ENV === "development") return true;
    const v = process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase();
    if (!v) return false;
    return v === "development" || v === "dev" || v === "local";
}

function applyDevDemoQueries(rows: RowState[]): RowState[] {
    const next = [...rows];
    next[0] = {...next[0], query: DEV_DEMO_QUERY_1};
    next[1] = {...next[1], query: DEV_DEMO_QUERY_2};
    return next;
}

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
    const rows = Array.from({length: MAX_TARGETS}, () => ({
        query: "",
        selected: null,
        suggestions: [],
        open: false,
        loading: false,
    }));
    if (isLocalOrDevLikeEnv()) return applyDevDemoQueries(rows);
    return rows;
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
    return {lat: lat / n, lng: lng / n};
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLng / 2);
    const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function routeMidpointByDistance(points: { lat: number; lng: number }[]): { lat: number; lng: number } | null {
    if (points.length < 2) return null;
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) total += haversineMeters(points[i], points[i + 1]);
    if (!Number.isFinite(total) || total <= 0) return null;

    const half = total / 2;
    let acc = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const seg = haversineMeters(a, b);
        if (!Number.isFinite(seg) || seg <= 0) continue;
        if (acc + seg >= half) {
            const t = (half - acc) / seg;
            return {lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t};
        }
        acc += seg;
    }
    return points[Math.floor(points.length / 2)] ?? null;
}

function toArray(v: unknown): unknown[] {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    return [v];
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

function normalizeKakaoKeywordDoc(item: unknown): Suggestion | null {
    const rec = asRecord(item);
    const label = pickString(rec, ["place_name", "placeName", "name"]);
    const address = pickString(rec, ["road_address_name", "roadAddressName", "address_name", "addressName", "address"]);
    const lng = pickNumber(rec, "x");
    const lat = pickNumber(rec, "y");
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
        id: pickString(rec, ["id"]) || `${label}-${lat},${lng}`,
        label,
        address,
        lat,
        lng,
    };
}

async function keywordSearch(query: string): Promise<Suggestion[]> {
    const qs = new URLSearchParams({query, size: "8", page: "1"});
    const res = await fetch(`/api/kakao/keyword?${qs}`);
    const json = (await res.json()) as { ok?: boolean; data?: unknown };
    if (!res.ok || !json.ok || !json.data) return [];
    const data = asRecord(json.data);
    const docs = toArray(data.documents);
    return docs.map(normalizeKakaoKeywordDoc).filter((s): s is Suggestion => s != null);
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const qs = new URLSearchParams({x: String(lng), y: String(lat)});
    const res = await fetch(`/api/kakao/coord2address?${qs}`);
    const json = (await res.json()) as { ok?: boolean; data?: unknown };
    if (!res.ok || !json.ok || !json.data) return null;

    const root = asRecord(json.data);
    const docs = toArray(root.documents);
    const first = asRecord(docs[0]);
    const road = asRecord(first.road_address);
    const addr = asRecord(first.address);
    return (
        pickString(road, ["address_name", "addressName"]) ||
        pickString(addr, ["address_name", "addressName"]) ||
        null
    );
}

async function nearestSubwayStation(
    lat: number,
    lng: number
): Promise<MidpointDetails["nearestSubway"]> {
    // Kakao category group code for subway station: SW8
    const qs = new URLSearchParams({
        category_group_code: "SW8",
        x: String(lng),
        y: String(lat),
        radius: "3000",
        sort: "distance",
        size: "5",
    });
    const res = await fetch(`/api/kakao/category?${qs}`);
    const json = (await res.json()) as { ok?: boolean; data?: unknown };
    if (!res.ok || !json.ok || !json.data) return null;

    const root = asRecord(json.data);
    const docs = toArray(root.documents);
    const first = asRecord(docs[0]);
    const name = pickString(first, ["place_name", "placeName", "name"]);
    const address =
        pickString(first, ["road_address_name", "roadAddressName"]) || pickString(first, ["address_name", "addressName"]);
    const x = pickNumber(first, "x");
    const y = pickNumber(first, "y");
    if (!name || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const distRaw = pickString(first, ["distance"]);
    const distanceM = distRaw ? Number(distRaw) : null;
    return {
        name,
        address,
        distanceM: Number.isFinite(distanceM) ? distanceM : null,
        lat: y,
        lng: x,
    };
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
    /** 모바일에서만: 찾기 완료 후 결과 요약 모달 */
    const [mobileResultOpen, setMobileResultOpen] = useState(false);
    /** 1·2번: TMAP 대중교통 경로 좌표 */
    const [routeBetween12, setRouteBetween12] = useState<{ lat: number; lng: number }[] | null>(null);
    const [route12Summary, setRoute12Summary] = useState<{
        totalTimeSec?: number;
        transferCount?: number;
        totalFare?: number;
    } | null>(null);
    const [route12Error, setRoute12Error] = useState<string | null>(null);
    const [route12Loading, setRoute12Loading] = useState(false);
    const [route12FallbackNotice, setRoute12FallbackNotice] = useState<string | null>(null);

    const requestIdRef = useRef(0);
    const firstInputRef = useRef<HTMLInputElement | null>(null);
    const localhostDemoAppliedRef = useRef(false);

    useEffect(() => {
        firstInputRef.current?.focus();
    }, []);

    /** 프로덕션 빌드 + localhost(예: next start)에서만 보강 — 위와 중복 없음 */
    useEffect(() => {
        if (isLocalOrDevLikeEnv()) return;
        if (localhostDemoAppliedRef.current) return;
        const h = typeof window !== "undefined" ? window.location.hostname : "";
        if (h !== "localhost" && h !== "127.0.0.1" && h !== "::1") return;
        localhostDemoAppliedRef.current = true;
        queueMicrotask(() => {
            setRows((prev) => {
                if (prev[0].query !== "" || prev[1].query !== "") return prev;
                return applyDevDemoQueries(prev);
            });
        });
    }, []);

    const selectedPoints = useMemo(
        () =>
            rows.flatMap((r, idx) =>
                r.selected ? [{...r.selected, rowIndex: idx}] : []
            ) as (SelectedPlace & { rowIndex: number })[],
        [rows]
    );

    const placeRow0 = rows[0]?.selected ?? null;
    const placeRow1 = rows[1]?.selected ?? null;
    const bothFirstTwoSelected = Boolean(placeRow0 && placeRow1);
    const route12ForMap = bothFirstTwoSelected ? routeBetween12 : null;
    const routeMidpoint12 = useMemo(
        () => (route12ForMap && route12ForMap.length >= 2 ? routeMidpointByDistance(route12ForMap) : null),
        [route12ForMap]
    );

    const canRun = selectedPoints.length >= 2 && !modalOpen;

    const kakaoTransitUrl = useMemo(() => {
        const a = selectedPoints.find((p) => p.rowIndex === 0) ?? null;
        const b = selectedPoints.find((p) => p.rowIndex === 1) ?? null;
        if (!a || !b) return null;
        // Kakao Map: /link/by/{이동수단}/이름,위도,경도/이름,위도,경도 (traffic=대중교통)
        return `https://map.kakao.com/link/by/traffic/${encodeURIComponent(a.label)},${a.lat},${a.lng}/${encodeURIComponent(
            b.label
        )},${b.lat},${b.lng}`;
    }, [selectedPoints]);

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
        if (idx === 0 || idx === 1) {
            setRouteBetween12(null);
            setRoute12Summary(null);
            setRoute12Error(null);
        }
        setRows((prev) => {
            const next = [...prev];
            next[idx] = {
                ...next[idx],
                query: s.label,
                selected: {id: s.id, label: s.label, address: s.address, lat: s.lat, lng: s.lng},
                suggestions: [],
                open: false,
                loading: false,
            };
            return next;
        });
    }, []);

    const clearRow = useCallback((idx: number) => {
        if (idx === 0 || idx === 1) {
            setRouteBetween12(null);
            setRoute12Summary(null);
            setRoute12Error(null);
        }
        setRows((prev) => {
            const next = [...prev];
            next[idx] = {...next[idx], query: "", selected: null, suggestions: [], open: false};
            return next;
        });
    }, []);

    useEffect(() => {
        const active = rows
            .map((r, idx) => ({r, idx}))
            .filter(({r}) => r.open && r.query.trim().length >= 2);
        if (active.length === 0) return;

        let cancelled = false;
        const localRequestId = ++requestIdRef.current;

        (async () => {
            for (const {r, idx} of active) {
                const q = r.query.trim();
                await sleep(200);
                if (cancelled) return;
                if (localRequestId !== requestIdRef.current) return;
                if (q !== rows[idx]?.query.trim()) continue;

                setRows((prev) => {
                    const next = [...prev];
                    next[idx] = {...next[idx], loading: true};
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
        setMobileResultOpen(false);
        setResultMidpoint(null);
        setMidpointDetails({address: null, nearestSubway: null});
        setRouteBetween12(null);
        setRoute12Summary(null);
        setRoute12Error(null);
        setRoute12FallbackNotice(null);

        const points = rows.slice(0, 2).map((r) => r.selected).filter(Boolean) as SelectedPlace[];
        if (points.length < 2) {
            setError("최소 2개 이상의 장소를 선택해 주세요.");
            return;
        }

        setModalOpen(true);
        setModalMessage("중간지점을 계산 중…");
        await sleep(250);

        const start12 = rows[0]?.selected ?? null;
        const end12 = rows[1]?.selected ?? null;
        if (!start12 || !end12) {
            setError("1번과 2번 장소를 모두 선택해 주세요.");
            setModalOpen(false);
            return;
        }

        setRoute12Loading(true);
        let chosenMid: { lat: number; lng: number } | null = null;
        try {
            const res = await fetch("/api/tmap/transit/routes", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    startX: String(start12.lng),
                    startY: String(start12.lat),
                    endX: String(end12.lng),
                    endY: String(end12.lat),
                    count: 1,
                    lang: 0,
                }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                data?: unknown;
                error?: string;
                upstreamStatus?: number
            };
            if (!res.ok || !json.ok) {
                setRouteBetween12(null);
                setRoute12Summary(null);
                const is429 = res.status === 429 || json.upstreamStatus === 429 || String(json.error ?? "").includes("429");
                if (is429) {
                    setRoute12FallbackNotice(
                        "TMAP 대중교통 길찾기 사용량이 초과되어(429) 직선거리 평균 중심으로 대체해 표시합니다."
                    );
                    chosenMid = midpointOf(points);
                } else {
                    setRoute12Error(json?.error ?? "TMAP 대중교통 경로를 가져오지 못했어요.");
                    chosenMid = midpointOf(points);
                }
            } else {
                const coords = parseTmapTransitPath(json.data);
                const summary = pickTmapTransitSummary(json.data);
                if (coords.length >= 2) {
                    setRouteBetween12(coords);
                    setRoute12Summary(summary);
                    chosenMid = routeMidpointByDistance(coords);
                } else {
                    setRouteBetween12(null);
                    setRoute12Summary(null);
                    setRoute12Error("TMAP 응답에서 경로 좌표를 추출하지 못했어요.");
                    chosenMid = midpointOf(points);
                }
            }
        } catch {
            setRouteBetween12(null);
            setRoute12Summary(null);
            setRoute12Error("TMAP 대중교통 경로 요청 중 오류가 발생했어요.");
            chosenMid = midpointOf(points);
        } finally {
            setRoute12Loading(false);
        }

        setResultMidpoint(chosenMid);
        if (chosenMid) {
            setModalMessage("결과 주소를 찾는 중…");
            const address = await reverseGeocode(chosenMid.lat, chosenMid.lng);
            const nearestSubway = await nearestSubwayStation(chosenMid.lat, chosenMid.lng);
            setMidpointDetails({address, nearestSubway});
            await sleep(250);
        }

        setModalMessage("지도에 표시하는 중…");
        await sleep(450);
        setModalMessage("완료!");
        await sleep(250);
        setModalOpen(false);

        if (chosenMid && isMobileViewport()) {
            setMobileResultOpen(true);
        }
    }, [rows]);

    return (
        <div
            className="flex min-h-full flex-1 flex-col bg-zinc-50"
            onMouseDown={() =>
                setRows((prev) => prev.map((r) => ({...r, open: false})))
            }
        >
            <ProgressModal open={modalOpen} title="중간지점 찾는 중" message={modalMessage}/>

            <MobileMidpointResultModal
                open={mobileResultOpen}
                onClose={() => setMobileResultOpen(false)}
                autoCloseSeconds={MOBILE_RESULT_AUTO_CLOSE_SEC}
                resultMidpoint={resultMidpoint}
                midpointDetails={midpointDetails}
                notice={route12FallbackNotice}
            />

            <header className="border-b border-zinc-200 bg-white">
                <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
                    <div>
                        <div className="text-lg font-semibold text-zinc-900">중간지점 찾기</div>
                        <div className="mt-1 text-sm text-zinc-600">
                            {/*지도는 카카오지도, 검색·대중교통 경로는 TMAP API 기준입니다.*/}
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
                    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">대상 장소 (최대 4개)</div>
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
                                                    next[idx] = {...next[idx], open: true};
                                                    return next;
                                                })
                                            }
                                            placeholder="장소/주소 키워드 입력"
                                            className={[
                                                "h-10 w-full rounded-xl border px-3 text-base text-zinc-900 outline-none md:text-sm",
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
                                                    {row.suggestions.map((s, sIdx) => (
                                                        <li key={`${s.id}-${s.lat.toFixed(6)},${s.lng.toFixed(6)}-${sIdx}`}>
                                                            <button
                                                                type="button"
                                                                className="w-full cursor-pointer px-3 py-2 text-left hover:bg-zinc-50"
                                                                onClick={() => onPickSuggestion(idx, s)}
                                                            >
                                                                <div className="text-sm font-semibold text-zinc-900">
                                                                    {s.label}
                                                                </div>
                                                                <div
                                                                    className="mt-0.5 text-xs text-zinc-500">{s.address}</div>
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
                            <div
                                className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {error}
                            </div>
                        ) : null}

                        <div className="mt-4 flex gap-2">
                            <button
                                className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={run}
                                disabled={!canRun}
                            >
                                중간지점 찾기
                            </button>
                            <a
                                className={[
                                    "inline-flex h-11 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                                    !kakaoTransitUrl ? "pointer-events-none cursor-not-allowed opacity-50" : "",
                                ].join(" ")}
                                href={kakaoTransitUrl ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                                aria-disabled={!kakaoTransitUrl}
                            >
                                카카오지도로 보기
                            </a>
                        </div>

                        <button
                            className="mt-4 hidden h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={run}
                            disabled={!canRun}
                        >
                            대중교통 경로 보기
                        </button>

                        <div className="mt-4 text-xs leading-6 text-zinc-500">
                            1번·2번 장소를 선택한 뒤 중간지점을 찾아보세요. (최대 {MAX_TARGETS}개)
                        </div>
                    </section>

                    <section className="flex flex-col gap-3">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                                <span className="font-semibold text-zinc-900">선택됨</span>
                                <span
                                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                  {selectedPoints.length}/{MAX_TARGETS}
                </span>
                                <span className="ml-auto text-xs text-zinc-500">
                  1↔2 구간 대중교통 경로를 바탕으로 중간지점을 계산합니다.
                </span>
                            </div>
                        </div>

                        <KakaoMap
                            points={selectedPoints}
                            midpoint={resultMidpoint}
                            nearestSubway={midpointDetails.nearestSubway}
                            routeBetween12={route12ForMap}
                            routeMidpoint12={routeMidpoint12}
                        />

                        {bothFirstTwoSelected ? (
                            <div className="mt-2 text-xs text-zinc-600" aria-live="polite">
                                {route12Loading ? (
                                    <span className="text-zinc-500">1↔2 대중교통 경로 불러오는 중…</span>
                                ) : route12ForMap && route12ForMap.length >= 2 ? (
                                    <span className="font-medium text-sky-900">
                    1↔2 대중교통 경로 표시(중간지점 계산 완료)
                                        {route12Summary != null &&
                                        (route12Summary.totalTimeSec != null ||
                                            route12Summary.transferCount != null ||
                                            route12Summary.totalFare != null)
                                            ? ` (${[
                                                route12Summary.totalTimeSec != null
                                                    ? `약 ${Math.round(route12Summary.totalTimeSec / 60)}분`
                                                    : null,
                                                route12Summary.transferCount != null
                                                    ? `환승 ${route12Summary.transferCount}회`
                                                    : null,
                                                route12Summary.totalFare != null
                                                    ? `요금 약 ${route12Summary.totalFare}원`
                                                    : null,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")})`
                                            : ""}
                  </span>
                                ) : route12Error && !route12FallbackNotice ? (
                                    <span className="text-amber-800">{route12Error}</span>
                                ) : null}
                            </div>
                        ) : null}

                        {resultMidpoint ? (
                            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                                {route12FallbackNotice ? (
                                    <div
                                        className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                        {route12FallbackNotice}
                                    </div>
                                ) : null}

                                <div className="grid grid-cols-1 gap-3 text-sm text-zinc-800 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <div className="text-xs font-semibold text-zinc-500">중간지점 좌표</div>
                                        <div
                                            className="mt-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700">
                                            {resultMidpoint.lat.toFixed(5)}, {resultMidpoint.lng.toFixed(5)}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <div className="text-xs font-semibold text-zinc-500">중간지점 주소</div>
                                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                                            {midpointDetails.address ??
                                                <span className="text-zinc-500">주소를 찾지 못했어요.</span>}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <div className="text-xs font-semibold text-zinc-500">가장 가까운 지하철역</div>
                                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                                            {midpointDetails.nearestSubway ? (
                                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                                    <div
                                                        className="font-semibold text-zinc-900">{midpointDetails.nearestSubway.name}</div>
                                                    <div
                                                        className="w-full text-xs text-zinc-600">{midpointDetails.nearestSubway.address}</div>
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

