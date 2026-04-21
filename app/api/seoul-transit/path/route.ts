import { NextRequest, NextResponse } from "next/server";

/** 서울특별시_대중교통환승경로 조회 서비스 (활용가이드 20211116) — ws.bus.go.kr */
const BASE = "http://ws.bus.go.kr/api/rest/pathinfo";

type PathMode = "subway" | "bus" | "busnsub";

function pathOperation(mode: PathMode) {
  switch (mode) {
    case "subway":
      return "getPathInfoBySubway";
    case "bus":
      return "getPathInfoByBus";
    default:
      return "getPathInfoByBusNSub";
  }
}

export async function GET(req: NextRequest) {
  const key = process.env.SEOUL_TRANSIT_SERVICE_KEY;
  if (!key?.trim()) {
    return NextResponse.json(
      { error: "환경변수 SEOUL_TRANSIT_SERVICE_KEY 가 설정되어 있지 않습니다." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get("mode") ?? "busnsub") as PathMode;
  const startX = searchParams.get("startX");
  const startY = searchParams.get("startY");
  const endX = searchParams.get("endX");
  const endY = searchParams.get("endY");

  if (!startX || !startY || !endX || !endY) {
    return NextResponse.json(
      { error: "startX, startY, endX, endY 가 모두 필요합니다. (WGS84: X=경도, Y=위도)" },
      { status: 400 }
    );
  }

  const op = pathOperation(mode);
  const url = new URL(`${BASE}/${op}`);
  url.searchParams.set("ServiceKey", key.trim());
  url.searchParams.set("startX", startX);
  url.searchParams.set("startY", startY);
  url.searchParams.set("endX", endX);
  url.searchParams.set("endY", endY);
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
      return NextResponse.json({ ok: true, mode, operation: op, data });
    } catch {
      return NextResponse.json(
        { ok: false, mode, operation: op, error: "JSON 파싱 실패", raw: text.slice(0, 2000) },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    {
      ok: false,
      mode,
      operation: op,
      error: "JSON이 아닌 응답입니다. resultType=json 확인 또는 공공데이터포털 키/호출제한을 확인하세요.",
      contentType,
      raw: text.slice(0, 2000),
    },
    { status: 502 }
  );
}
