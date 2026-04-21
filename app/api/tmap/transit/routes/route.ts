import { NextRequest, NextResponse } from "next/server";

const TRANSIT_URL = "https://apis.openapi.sk.com/transit/routes";

function tmapKey() {
  return process.env.TMAP_APP_KEY?.trim() ?? process.env.NEXT_PUBLIC_TMAP_APP_KEY?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  const key = tmapKey();
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "환경변수 TMAP_APP_KEY 또는 NEXT_PUBLIC_TMAP_APP_KEY 가 필요합니다." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body가 필요합니다." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const sx = b.startX ?? b.startx;
  const sy = b.startY ?? b.starty;
  const ex = b.endX ?? b.endx;
  const ey = b.endY ?? b.endy;
  if (sx == null || sy == null || ex == null || ey == null) {
    return NextResponse.json(
      { ok: false, error: "startX, startY, endX, endY 가 필요합니다. (WGS84: X=경도, Y=위도)" },
      { status: 400 }
    );
  }

  const payload = {
    startX: String(sx),
    startY: String(sy),
    endX: String(ex),
    endY: String(ey),
    count: typeof b.count === "number" ? b.count : 1,
    lang: typeof b.lang === "number" ? b.lang : 0,
    format: "json",
    ...(typeof b.searchDttm === "string" ? { searchDttm: b.searchDttm } : {}),
  };

  const upstream = await fetch(TRANSIT_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      appKey: key,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await upstream.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json(
      { ok: false, error: "TMAP 응답 JSON 파싱 실패", raw: text.slice(0, 800) },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    // 대중교통 API는 POI/지오코딩과 별도 상품/권한이라 401/403 이 자주 발생함.
    // 원인 파악을 위해 upstream status를 그대로 내려보냄.
    return NextResponse.json(
      {
        ok: false,
        error: `TMAP HTTP ${upstream.status}`,
        upstreamStatus: upstream.status,
        upstreamStatusText: upstream.statusText,
        data,
      },
      { status: upstream.status }
    );
  }

  return NextResponse.json({ ok: true, data });
}
