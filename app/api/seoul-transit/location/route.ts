import { NextRequest, NextResponse } from "next/server";

const BASE = "http://ws.bus.go.kr/api/rest/pathinfo/getLocationInfo";

export async function GET(req: NextRequest) {
  const key = process.env.SEOUL_TRANSIT_SERVICE_KEY;
  if (!key?.trim()) {
    return NextResponse.json(
      { error: "환경변수 SEOUL_TRANSIT_SERVICE_KEY 가 설정되어 있지 않습니다." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const stSrch = searchParams.get("stSrch");
  if (!stSrch?.trim()) {
    return NextResponse.json({ error: "stSrch(검색어)가 필요합니다." }, { status: 400 });
  }

  const url = new URL(BASE);
  url.searchParams.set("ServiceKey", key.trim());
  url.searchParams.set("stSrch", stSrch.trim());
  url.searchParams.set("resultType", "json");

  const upstream = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await upstream.text();
  const contentType = upstream.headers.get("content-type") ?? "";
  const trimmed = text.trimStart();

  if (contentType.includes("json") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(text) as unknown;
      return NextResponse.json({ ok: true, data });
    } catch {
      return NextResponse.json(
        { ok: false, error: "JSON 파싱 실패", raw: text.slice(0, 2000) },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: "JSON이 아닌 응답입니다.",
      contentType,
      raw: text.slice(0, 2000),
    },
    { status: 502 }
  );
}
