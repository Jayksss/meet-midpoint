/**
 * 서울시 ws.bus.go.kr pathinfo JSON 응답에서 pathList 구간 좌표를 순서대로 뽑음.
 * (활용가이드: fx/fy 탑승, tx/ty 하차 — WGS84, fy·ty=위도, fx·tx=경도)
 */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function toArray(v: unknown): unknown[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return Number.NaN;
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

/**
 * API data 는 `/api/seoul-transit/path` 의 JSON `{ ok, data }` 중 `data` 또는 전체 루트.
 */
export function parseSeoulPathCoords(root: unknown): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  const r = asRecord(root);
  const data = asRecord(r.data ?? r.Data ?? root);
  const sr = asRecord(data.ServiceResult ?? data.serviceResult ?? r.ServiceResult);
  const body = asRecord(sr.msgBody ?? sr.MsgBody);
  const rawItems = body.itemList ?? body.ItemList;
  const items = toArray(rawItems);
  if (items.length === 0) return [];

  const first = asRecord(items[0]);
  const rawPl = first.pathList ?? first.PathList;
  const segments = toArray(rawPl);

  for (const seg of segments) {
    const s = asRecord(seg);
    const fy = num(s.fy);
    const fx = num(s.fx);
    const ty = num(s.ty);
    const tx = num(s.tx);
    pushIfNew(pts, fy, fx);
    pushIfNew(pts, ty, tx);
  }

  return pts;
}

export function pickFirstRouteSummary(root: unknown): { distance?: string; time?: string } {
  const r = asRecord(root);
  const data = asRecord(r.data ?? r.Data ?? root);
  const sr = asRecord(data.ServiceResult ?? data.serviceResult ?? r.ServiceResult);
  const body = asRecord(sr.msgBody ?? sr.MsgBody);
  const rawItems = body.itemList ?? body.ItemList;
  const items = toArray(rawItems);
  if (items.length === 0) return {};
  const first = asRecord(items[0]);
  return {
    distance: first.distance != null ? String(first.distance) : undefined,
    time: first.time != null ? String(first.time) : undefined,
  };
}
