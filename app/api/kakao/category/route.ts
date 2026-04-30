import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout, parseIntInRange, parseNumberInRange, rateLimit } from "@/lib/security";

const KAKAO_CATEGORY_URL = "https://dapi.kakao.com/v2/local/search/category.json";

function kakaoRestKey() {
  return process.env.KAKAO_REST_API_KEY?.trim() ?? process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY?.trim() ?? "";
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "api:kakao:category", limit: 60, windowMs: 60_000 });
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
  const categoryGroupCode = searchParams.get("category_group_code");
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  if (!categoryGroupCode?.trim()) {
    return NextResponse.json({ ok: false, error: "category_group_code 가 필요합니다." }, { status: 400 });
  }
  const cgc = categoryGroupCode.trim();
  if (!/^[A-Z0-9]{2,6}$/.test(cgc)) {
    return NextResponse.json({ ok: false, error: "category_group_code 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!x?.trim() || !y?.trim()) {
    return NextResponse.json({ ok: false, error: "x,y 가 필요합니다." }, { status: 400 });
  }
  const lon = parseNumberInRange(x.trim(), -180, 180);
  const lat = parseNumberInRange(y.trim(), -90, 90);
  if (lon == null || lat == null) {
    return NextResponse.json({ ok: false, error: "x,y 좌표가 올바르지 않습니다." }, { status: 400 });
  }

  const url = new URL(KAKAO_CATEGORY_URL);
  url.searchParams.set("category_group_code", cgc);
  url.searchParams.set("x", String(lon));
  url.searchParams.set("y", String(lat));
  const radius = parseIntInRange(searchParams.get("radius") ?? "2000", 1, 20000) ?? 2000;
  url.searchParams.set("radius", String(radius));
  const sort = (searchParams.get("sort") ?? "distance").toLowerCase();
  url.searchParams.set("sort", sort === "distance" ? "distance" : "accuracy");
  const page = parseIntInRange(searchParams.get("page") ?? "1", 1, 45) ?? 1;
  const size = parseIntInRange(searchParams.get("size") ?? "5", 1, 15) ?? 5;
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));

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
      { ok: false, error: "KAKAO 카테고리 검색 응답 JSON 파싱 실패", raw: text.slice(0, 800) },
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

