import { NextRequest, NextResponse } from "next/server";

const POIS_URL = "https://apis.openapi.sk.com/tmap/pois";

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
  const searchKeyword = searchParams.get("searchKeyword");
  if (!searchKeyword?.trim()) {
    return NextResponse.json({ ok: false, error: "searchKeyword 가 필요합니다." }, { status: 400 });
  }

  const url = new URL(POIS_URL);
  url.searchParams.set("version", "1");
  url.searchParams.set("searchKeyword", searchKeyword.trim());
  url.searchParams.set("searchType", searchParams.get("searchType") ?? "all");
  url.searchParams.set("page", searchParams.get("page") ?? "1");
  url.searchParams.set("count", searchParams.get("count") ?? "15");
  url.searchParams.set("reqCoordType", "WGS84GEO");
  url.searchParams.set("resCoordType", "WGS84GEO");

  const radius = searchParams.get("radius");
  const centerLat = searchParams.get("centerLat");
  const centerLon = searchParams.get("centerLon");
  const searchtypCd = searchParams.get("searchtypCd");
  if (radius != null) url.searchParams.set("radius", radius);
  if (centerLat != null) url.searchParams.set("centerLat", centerLat);
  if (centerLon != null) url.searchParams.set("centerLon", centerLon);
  if (searchtypCd != null) url.searchParams.set("searchtypCd", searchtypCd);

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
      { ok: false, error: "TMAP POI 응답 JSON 파싱 실패", raw: text.slice(0, 800) },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return NextResponse.json({ ok: false, error: `TMAP HTTP ${upstream.status}`, data }, { status: 502 });
  }

  return NextResponse.json({ ok: true, data });
}
