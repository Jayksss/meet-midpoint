import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout, parseIntInRange, rateLimit } from "@/lib/security";

const KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

function kakaoRestKey() {
  return process.env.KAKAO_REST_API_KEY?.trim() ?? process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY?.trim() ?? "";
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "api:kakao:keyword", limit: 60, windowMs: 60_000 });
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
  const query = searchParams.get("query");
  if (!query?.trim()) {
    return NextResponse.json({ ok: false, error: "query 가 필요합니다." }, { status: 400 });
  }
  const q = query.trim();
  if (q.length > 80) {
    return NextResponse.json({ ok: false, error: "query 가 너무 깁니다. (최대 80자)" }, { status: 400 });
  }

  const url = new URL(KAKAO_KEYWORD_URL);
  url.searchParams.set("query", q);
  const page = parseIntInRange(searchParams.get("page") ?? "1", 1, 45) ?? 1;
  const size = parseIntInRange(searchParams.get("size") ?? "8", 1, 15) ?? 8;
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));

  const x = searchParams.get("x");
  const y = searchParams.get("y");
  const radius = searchParams.get("radius");
  if (x != null) url.searchParams.set("x", x);
  if (y != null) url.searchParams.set("y", y);
  if (radius != null) url.searchParams.set("radius", radius);

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
      { ok: false, error: "KAKAO 키워드 검색 응답 JSON 파싱 실패", raw: text.slice(0, 800) },
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

