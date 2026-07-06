import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyVisitor,
  normalizeVisitorIngestEvents,
  sanitizeVisitorHeaders,
  visitorEventRow,
} from "../lib/seo/visitor-intelligence";

test("visitor intelligence classifies self-declared AI crawlers", () => {
  const classification = classifyVisitor({
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
    path: "/pricing",
  });

  assert.equal(classification.botName, "GPTBot");
  assert.equal(classification.botCategory, "ai");
  assert.equal(classification.botVerification, "self_declared");
  assert.ok(classification.automationScore >= 70);
});

test("visitor intelligence flags scanner paths even with a normal browser User-Agent", () => {
  const classification = classifyVisitor({
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 Chrome/126 Safari/537.36",
    path: "/.env",
  });

  assert.equal(classification.botCategory, "scanner");
  assert.ok(classification.automationScore >= 85);
  assert.ok(classification.reasons.some((reason) => /scanner/i.test(reason)));
});

test("visitor intelligence normalizes event contract and hashes IPs", () => {
  const events = normalizeVisitorIngestEvents(
    {
      events: [
        {
          eventType: "request",
          source: "edge",
          siteOrigin: "https://example.com",
          path: "/blog?ref=test",
          method: "get",
          statusCode: 200,
          userAgent: "SemrushBot/7~bl",
          visitorIp: "203.0.113.10",
          requestHeaders: {
            cookie: "should-not-store",
            "cf-ray": "abc123",
          },
          metadata: {
            routeGroup: "marketing",
          },
        },
      ],
    },
    { ipHashSalt: "test-salt", fallbackUserAgent: null }
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].pageUrl, "https://example.com/blog?ref=test");
  assert.equal(events[0].method, "GET");
  assert.equal(events[0].visitorIpHash?.length, 64);
  assert.equal(events[0].visitorIpPrefix, "203.0.113.0/24");
  assert.deepEqual(events[0].requestHeaders, { "cf-ray": "abc123" });
  assert.equal(events[0].classification.botName, "SemrushBot");

  const row = visitorEventRow("client-a", events[0]);
  assert.equal(row.user_id, "client-a");
  assert.equal(row.bot_category, "seo");
  assert.equal(row.request_headers_json["cf-ray"], "abc123");
});

test("visitor intelligence only preserves safe request headers", () => {
  assert.deepEqual(
    sanitizeVisitorHeaders({
      authorization: "Bearer secret",
      cookie: "secret",
      "accept-language": "en-US",
      "x-vercel-ip-country": "US",
    }),
    {
      "accept-language": "en-US",
      "x-vercel-ip-country": "US",
    }
  );
});
