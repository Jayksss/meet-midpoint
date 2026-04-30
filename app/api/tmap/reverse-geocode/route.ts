import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout, parseNumberInRange, rateLimit } from "@/lib/security";

const GEO_URL = "https://apis.openapi.sk.com/tmap/geo/reversegeocoding";

function tmapKey() {
  return process.env.TMAP_APP_KEY?.trim() ?? process.env.NEXT_PUBLIC_TMAP_APP_KEY?.trim() ?? "";
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "api:tmap:reverse-geocode", limit: 60, windowMs: 60_000 });
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
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  if (!lat || !lon) {
    return NextResponse.json({ ok: false, error: "lat, lon 이 필요합니다." }, { status: 400 });
  }
  const la = parseNumberInRange(lat, -90, 90);
  const lo = parseNumberInRange(lon, -180, 180);
  if (la == null || lo == null) {
    return NextResponse.json({ ok: false, error: "lat, lon 좌표가 올바르지 않습니다." }, { status: 400 });
  }

  const url = new URL(GEO_URL);
  url.searchParams.set("version", "1");
  url.searchParams.set("lat", String(la));
  url.searchParams.set("lon", String(lo));
  url.searchParams.set("coordType", "WGS84GEO");
  url.searchParams.set("addressType", searchParams.get("addressType") ?? "A10");
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
      { ok: false, error: "TMAP 역지오코딩 JSON 파싱 실패", raw: text.slice(0, 800) },
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
