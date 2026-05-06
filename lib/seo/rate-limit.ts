const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new Error(`Rate limit exceeded. Try again in ${retryAfterSeconds}s.`);
  }

  bucket.count += 1;
}

export function rateLimitFromRequest(request: Request, action: string, limit = 20, windowMs = 60_000) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientId = request.headers.get("x-seo-client-id") || "unknown-client";
  const key = `${action}:${clientId}:${forwardedFor || "local"}`;
  rateLimit(key, limit, windowMs);
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
