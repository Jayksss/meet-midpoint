import { NextRequest, NextResponse } from "next/server";

const KAKAO_COORD2ADDRESS_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json";

function kakaoRestKey() {
  return process.env.KAKAO_REST_API_KEY?.trim() ?? process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY?.trim() ?? "";
}

export async function GET(req: NextRequest) {
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

  const url = new URL(KAKAO_COORD2ADDRESS_URL);
  url.searchParams.set("x", x.trim());
  url.searchParams.set("y", y.trim());
  // 기본은 WGS84. 혹시 다른 좌표계를 쓰고 싶으면 input_coord/output_coord 확장 가능

  const upstream = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `KakaoAK ${key}`,
    },
    cache: "no-store",
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
    return NextResponse.json({ ok: false, error: `KAKAO HTTP ${upstream.status}`, data }, { status: 502 });
  }

  return NextResponse.json({ ok: true, data });
}

