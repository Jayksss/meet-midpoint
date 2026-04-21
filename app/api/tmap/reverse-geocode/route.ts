import { NextRequest, NextResponse } from "next/server";

const GEO_URL = "https://apis.openapi.sk.com/tmap/geo/reversegeocoding";

function tmapKey() {
  return process.env.TMAP_APP_KEY?.trim() ?? process.env.NEXT_PUBLIC_TMAP_APP_KEY?.trim() ?? "";
}

export async function GET(req: NextRequest) {
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

  const url = new URL(GEO_URL);
  url.searchParams.set("version", "1");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("coordType", "WGS84GEO");
  url.searchParams.set("addressType", searchParams.get("addressType") ?? "A10");
  url.searchParams.set("appKey", key);

  const upstream = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
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
    return NextResponse.json({ ok: false, error: `TMAP HTTP ${upstream.status}`, data }, { status: 502 });
  }

  return NextResponse.json({ ok: true, data });
}
