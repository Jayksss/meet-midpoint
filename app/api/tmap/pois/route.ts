import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout, parseIntInRange, parseNumberInRange, rateLimit } from "@/lib/security";

const POIS_URL = "https://apis.openapi.sk.com/tmap/pois";

function tmapKey() {
  return process.env.TMAP_APP_KEY?.trim() ?? process.env.NEXT_PUBLIC_TMAP_APP_KEY?.trim() ?? "";
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "api:tmap:pois", limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const key = tmapKey();
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "환경변수 TMAP_APP_KEY 또는 NEXT_PUBLIC_TMAP_APP_KEY 가 필요합니다." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const searchKeyword = searchParams.get("searchKeyword");
  if (!searchKeyword?.trim()) {
    return NextResponse.json({ ok: false, error: "searchKeyword 가 필요합니다." }, { status: 400 });
  }
  const kw = searchKeyword.trim();
  if (kw.length > 80) {
    return NextResponse.json({ ok: false, error: "searchKeyword 가 너무 깁니다. (최대 80자)" }, { status: 400 });
  }

  const url = new URL(POIS_URL);
  url.searchParams.set("version", "1");
  url.searchParams.set("searchKeyword", kw);
  url.searchParams.set("searchType", searchParams.get("searchType") ?? "all");
  const page = parseIntInRange(searchParams.get("page") ?? "1", 1, 999) ?? 1;
  const count = parseIntInRange(searchParams.get("count") ?? "15", 1, 20) ?? 15;
  url.searchParams.set("page", String(page));
  url.searchParams.set("count", String(count));
  url.searchParams.set("reqCoordType", "WGS84GEO");
  url.searchParams.set("resCoordType", "WGS84GEO");

  const radius = searchParams.get("radius");
  const centerLat = searchParams.get("centerLat");
  const centerLon = searchParams.get("centerLon");
  const searchtypCd = searchParams.get("searchtypCd");
  if (radius != null) {
    const r = parseIntInRange(radius, 1, 20) ?? 5;
    url.searchParams.set("radius", String(r));
  }
  if (centerLat != null) {
    const v = parseNumberInRange(centerLat, -90, 90);
    if (v == null) return NextResponse.json({ ok: false, error: "centerLat 가 올바르지 않습니다." }, { status: 400 });
    url.searchParams.set("centerLat", String(v));
  }
  if (centerLon != null) {
    const v = parseNumberInRange(centerLon, -180, 180);
    if (v == null) return NextResponse.json({ ok: false, error: "centerLon 가 올바르지 않습니다." }, { status: 400 });
    url.searchParams.set("centerLon", String(v));
  }
  if (searchtypCd != null) url.searchParams.set("searchtypCd", searchtypCd);

  url.searchParams.set("appKey", key);

  const upstream = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    timeoutMs: 8000,
  });

  const text = await upstream.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json(
      { ok: false, error: "TMAP POI 응답 JSON 파싱 실패", raw: text.slice(0, 800) },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: `TMAP HTTP ${upstream.status}` },
      { status: upstream.status === 429 ? 429 : 502 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
