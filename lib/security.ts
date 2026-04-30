import type { NextRequest } from "next/server";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  /** route key to separate buckets */
  key: string;
};

type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

type Bucket = { resetAt: number; count: number };

// NOTE: in-memory rate limit. Works best on single-instance/serverful deployments.
// On serverless/edge, each instance has its own memory (still useful but not strict global).
const buckets = new Map<string, Bucket>();

export function getClientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

export function rateLimit(req: NextRequest, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const ip = getClientIp(req);
  const bucketKey = `${opts.key}:${ip}`;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { resetAt: now + opts.windowMs, count: 1 });
    return { ok: true };
  }

  existing.count += 1;
  if (existing.count <= opts.limit) return { ok: true };

  const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return { ok: false, retryAfterSec };
}

export function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

export function parseNumberInRange(raw: string, min: number, max: number): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

export function parseIntInRange(raw: string, min: number, max: number): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

export async function readJsonBodyWithLimit(req: NextRequest, maxBytes: number): Promise<unknown> {
  const text = await req.text();
  // Conservative: JS string uses UTF-16, but length is still a decent DoS guard.
  if (text.length > maxBytes) throw new Error("BODY_TOO_LARGE");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 8000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

