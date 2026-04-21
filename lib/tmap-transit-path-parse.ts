/**
 * TMAP 대중교통 API 응답(metaData.plan.itineraries[0])에서 폴리라인 좌표 추출.
 * linestring: "경도,위도 경도,위도 …" (공백 구분)
 */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function toArray(v: unknown): unknown[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function pushIfNew(
  pts: { lat: number; lng: number }[],
  lat: number,
  lng: number
): void {
  const last = pts[pts.length - 1];
  if (last && Math.abs(last.lat - lat) < 1e-9 && Math.abs(last.lng - lng) < 1e-9) return;
  if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng });
}

function parseLinestringToPoints(s: unknown): { lat: number; lng: number }[] {
  if (typeof s !== "string" || !s.trim()) return [];
  const pts: { lat: number; lng: number }[] = [];
  for (const pair of s.trim().split(/\s+/)) {
    const [a, b] = pair.split(",");
    const lon = Number(a);
    const lat = Number(b);
    if (Number.isFinite(lat) && Number.isFinite(lon)) pushIfNew(pts, lat, lon);
  }
  return pts;
}

function appendLinestring(
  out: { lat: number; lng: number }[],
  s: unknown
): void {
  for (const p of parseLinestringToPoints(s)) pushIfNew(out, p.lat, p.lng);
}

function collectLegPoints(leg: Record<string, unknown>, out: { lat: number; lng: number }[]): void {
  const mode = String(leg.mode ?? "");

  const passShape = asRecord(leg.passShape);
  appendLinestring(out, passShape.linestring);

  const steps = toArray(leg.steps);
  for (const st of steps) {
    const step = asRecord(st);
    appendLinestring(out, step.linestring);
  }

  if (mode === "WALK" && steps.length === 0) {
    const start = asRecord(leg.start);
    const end = asRecord(leg.end);
    const slat = Number(start.lat);
    const slng = Number(start.lon);
    const elat = Number(end.lat);
    const elng = Number(end.lon);
    if (Number.isFinite(slat) && Number.isFinite(slng)) pushIfNew(out, slat, slng);
    if (Number.isFinite(elat) && Number.isFinite(elng)) pushIfNew(out, elat, elng);
  }
}

/** `/api/tmap/transit/routes` 가 돌려준 `data` (TMAP transit JSON) */
export function parseTmapTransitPath(root: unknown): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  const r = asRecord(root);
  const meta = asRecord(r.metaData);
  const plan = asRecord(meta.plan);
  const itineraries = toArray(plan.itineraries);
  if (itineraries.length === 0) return [];

  const first = asRecord(itineraries[0]);
  const legs = toArray(first.legs);
  for (const leg of legs) {
    collectLegPoints(asRecord(leg), out);
  }
  return out;
}

export function pickTmapTransitSummary(root: unknown): {
  totalTimeSec?: number;
  transferCount?: number;
  totalFare?: number;
} {
  const r = asRecord(root);
  const meta = asRecord(r.metaData);
  const plan = asRecord(meta.plan);
  const itineraries = toArray(plan.itineraries);
  if (itineraries.length === 0) return {};
  const first = asRecord(itineraries[0]);
  const tt = first.totalTime;
  const tc = first.transferCount;
  const fare = asRecord(first.fare);
  const reg = asRecord(fare.regular);
  const tf = reg.totalFare;
  return {
    totalTimeSec: typeof tt === "number" ? tt : undefined,
    transferCount: typeof tc === "number" ? tc : undefined,
    totalFare: typeof tf === "number" ? tf : undefined,
  };
}
