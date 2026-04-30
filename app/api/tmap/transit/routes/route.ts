import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout, parseIntInRange, parseNumberInRange, rateLimit, readJsonBodyWithLimit } from "@/lib/security";

const TRANSIT_URL = "https://apis.openapi.sk.com/transit/routes";

function tmapKey() {
  return process.env.TMAP_APP_KEY?.trim() ?? process.env.NEXT_PUBLIC_TMAP_APP_KEY?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "api:tmap:transit:routes", limit: 20, windowMs: 60_000 });
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

  let body: unknown;
  try {
    body = await readJsonBodyWithLimit(req, 10_000);
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

  const startX = parseNumberInRange(String(sx), -180, 180);
  const startY = parseNumberInRange(String(sy), -90, 90);
  const endX = parseNumberInRange(String(ex), -180, 180);
  const endY = parseNumberInRange(String(ey), -90, 90);
  if (startX == null || startY == null || endX == null || endY == null) {
    return NextResponse.json({ ok: false, error: "좌표 값이 올바르지 않습니다." }, { status: 400 });
  }

  const payload = {
    startX: String(startX),
    startY: String(startY),
    endX: String(endX),
    endY: String(endY),
    count: typeof b.count === "number" ? b.count : parseIntInRange(String(b.count ?? "1"), 1, 1) ?? 1,
    lang: typeof b.lang === "number" ? b.lang : parseIntInRange(String(b.lang ?? "0"), 0, 1) ?? 0,
    format: "json",
    ...(typeof b.searchDttm === "string" ? { searchDttm: b.searchDttm } : {}),
  };

  const upstream = await fetchWithTimeout(TRANSIT_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      appKey: key,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    timeoutMs: 12000,
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
      { ok: false, error: `TMAP HTTP ${upstream.status}`, upstreamStatus: upstream.status },
      { status: upstream.status === 429 ? 429 : 502 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
