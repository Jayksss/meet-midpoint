import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout, parseNumberInRange, rateLimit } from "@/lib/security";

const KAKAO_COORD2ADDRESS_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json";

function kakaoRestKey() {
  return process.env.KAKAO_REST_API_KEY?.trim() ?? process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY?.trim() ?? "";
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "api:kakao:coord2address", limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const key = kakaoRestKey();
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "환경변수 KAKAO_REST_API_KEY (권장) 또는 NEXT_PUBLIC_KAKAO_REST_API_KEY 가 필요합니다." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  if (!x?.trim() || !y?.trim()) {
    return NextResponse.json({ ok: false, error: "x,y 가 필요합니다." }, { status: 400 });
  }
  const lon = parseNumberInRange(x.trim(), -180, 180);
  const lat = parseNumberInRange(y.trim(), -90, 90);
  if (lon == null || lat == null) {
    return NextResponse.json({ ok: false, error: "x,y 좌표가 올바르지 않습니다." }, { status: 400 });
  }

  const url = new URL(KAKAO_COORD2ADDRESS_URL);
  url.searchParams.set("x", String(lon));
  url.searchParams.set("y", String(lat));
  // 기본은 WGS84. 혹시 다른 좌표계를 쓰고 싶으면 input_coord/output_coord 확장 가능

  const upstream = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `KakaoAK ${key}`,
    },
    cache: "no-store",
    timeoutMs: 8000,
  });

  const text = await upstream.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json(
      { ok: false, error: "KAKAO 좌표→주소 응답 JSON 파싱 실패", raw: text.slice(0, 800) },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: `KAKAO HTTP ${upstream.status}` },
      { status: upstream.status === 429 ? 429 : 502 }
    );
  }

  return NextResponse.json({ ok: true, data });
}

