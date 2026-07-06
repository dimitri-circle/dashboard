import crypto from "node:crypto";
import { randomUUID } from "node:crypto";

export type VisitorEventType = "request" | "pageview";
export type VisitorEventSource = "edge" | "server" | "browser" | "manual";
export type VisitorBotCategory = "human" | "search" | "ai" | "seo" | "monitoring" | "scanner" | "automation" | "unknown";
export type VisitorBotVerification = "verified" | "self_declared" | "failed" | "unknown" | "not_applicable";

export type VisitorClassification = {
  botName: string | null;
  botCategory: VisitorBotCategory;
  botVerification: VisitorBotVerification;
  automationScore: number;
  reasons: string[];
};

export type VisitorIngestEvent = {
  eventType: VisitorEventType;
  source: VisitorEventSource;
  occurredAt: string;
  siteOrigin: string;
  pageUrl: string;
  path: string;
  method: string | null;
  statusCode: number | null;
  referrer: string | null;
  userAgent: string | null;
  visitorIpHash: string | null;
  visitorIpPrefix: string | null;
  country: string | null;
  asn: string | null;
  classification: VisitorClassification;
  requestHeaders: Record<string, string>;
  metadata: Record<string, unknown>;
};

export type VisitorIngestPayload = {
  siteOrigin?: unknown;
  events?: unknown;
};

type KnownBot = {
  name: string;
  category: Exclude<VisitorBotCategory, "human" | "unknown">;
  pattern: RegExp;
};

const MAX_EVENTS_PER_REQUEST = 25;
const MAX_STRING_LENGTH = 600;
const MAX_METADATA_KEYS = 20;

const KNOWN_BOTS: KnownBot[] = [
  { name: "Googlebot", category: "search", pattern: /\bgooglebot\b|google-inspectiontool|googleother/i },
  { name: "Bingbot", category: "search", pattern: /\bbingbot\b|adidxbot/i },
  { name: "Applebot", category: "search", pattern: /\bapplebot\b/i },
  { name: "DuckDuckBot", category: "search", pattern: /\bduckduckbot\b/i },
  { name: "GPTBot", category: "ai", pattern: /\bgptbot\b/i },
  { name: "ChatGPT-User", category: "ai", pattern: /\bchatgpt-user\b/i },
  { name: "OAI-SearchBot", category: "ai", pattern: /\boai-searchbot\b/i },
  { name: "ClaudeBot", category: "ai", pattern: /\bclaudebot\b|anthropic-ai/i },
  { name: "Claude-User", category: "ai", pattern: /\bclaude-user\b/i },
  { name: "PerplexityBot", category: "ai", pattern: /\bperplexitybot\b|perplexity-user/i },
  { name: "Bytespider", category: "ai", pattern: /\bbytespider\b/i },
  { name: "CCBot", category: "ai", pattern: /\bccbot\b/i },
  { name: "Amazonbot", category: "ai", pattern: /\bamazonbot\b/i },
  { name: "AhrefsBot", category: "seo", pattern: /\bahrefsbot\b/i },
  { name: "SemrushBot", category: "seo", pattern: /\bsemrushbot\b/i },
  { name: "MJ12bot", category: "seo", pattern: /\bmj12bot\b/i },
  { name: "DotBot", category: "seo", pattern: /\bdotbot\b/i },
  { name: "UptimeRobot", category: "monitoring", pattern: /\buptimerobot\b/i },
  { name: "Pingdom", category: "monitoring", pattern: /\bpingdom\b/i },
  { name: "StatusCake", category: "monitoring", pattern: /\bstatuscake\b/i },
  { name: "Headless browser", category: "automation", pattern: /\bheadlesschrome\b|\bplaywright\b|\bpuppeteer\b/i },
  { name: "Command-line client", category: "automation", pattern: /\bcurl\b|\bwget\b|python-requests|go-http-client|java\//i },
  { name: "Crawler framework", category: "automation", pattern: /\bscrapy\b|\bhttpclient\b|\blibwww-perl\b/i },
];

const SCANNER_PATH_PATTERNS = [
  /\/\.env(?:$|\?)/i,
  /\/wp-admin\b/i,
  /\/wp-login\.php\b/i,
  /\/phpmyadmin\b/i,
  /\/xmlrpc\.php\b/i,
  /\/admin\b/i,
  /\/vendor\/phpunit\b/i,
  /\/actuator\b/i,
];

const SAFE_HEADER_NAMES = new Set([
  "accept",
  "accept-language",
  "cf-ipcountry",
  "cf-ray",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "x-forwarded-host",
  "x-vercel-ip-asn",
  "x-vercel-ip-country",
]);

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cleanString(value: unknown, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next ? next.slice(0, maxLength) : null;
}

function parseEventType(value: unknown): VisitorEventType {
  return value === "pageview" ? "pageview" : "request";
}

function parseSource(value: unknown): VisitorEventSource {
  if (value === "edge" || value === "server" || value === "browser" || value === "manual") return value;
  return "server";
}

function parseStatusCode(value: unknown) {
  const statusCode = Number(value);
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) return null;
  return statusCode;
}

function parseOccurredAt(value: unknown) {
  const raw = cleanString(value, 80);
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeUrl(siteOrigin: string | null, rawPageUrl: unknown, rawPath: unknown) {
  const pageUrl = cleanString(rawPageUrl, 1200);
  const rawPathString = cleanString(rawPath, 1200);

  if (pageUrl) {
    const parsed = new URL(pageUrl);
    return {
      pageUrl: parsed.toString(),
      path: `${parsed.pathname}${parsed.search}`,
      siteOrigin: parsed.origin,
    };
  }

  if (!siteOrigin) {
    throw new Error("siteOrigin or pageUrl is required.");
  }

  const normalizedPath = rawPathString?.startsWith("/") ? rawPathString : `/${rawPathString || ""}`;
  const parsed = new URL(normalizedPath, siteOrigin);
  return {
    pageUrl: parsed.toString(),
    path: `${parsed.pathname}${parsed.search}`,
    siteOrigin: parsed.origin,
  };
}

function safeMetadata(value: unknown) {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, MAX_METADATA_KEYS)
      .map(([key, item]) => {
        if (typeof item === "string") return [key.slice(0, 80), item.slice(0, MAX_STRING_LENGTH)];
        if (typeof item === "number" || typeof item === "boolean" || item === null) return [key.slice(0, 80), item];
        return [key.slice(0, 80), String(item).slice(0, MAX_STRING_LENGTH)];
      })
  );
}

export function sanitizeVisitorHeaders(value: unknown) {
  const record = asRecord(value);
  const sanitized: Record<string, string> = {};

  for (const [key, item] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();
    if (!SAFE_HEADER_NAMES.has(normalizedKey)) continue;
    const normalizedValue = cleanString(item, 240);
    if (normalizedValue) sanitized[normalizedKey] = normalizedValue;
  }

  return sanitized;
}

export function classifyVisitor(input: { userAgent?: string | null; path?: string | null }): VisitorClassification {
  const userAgent = input.userAgent || "";
  const path = input.path || "/";
  const reasons: string[] = [];
  let botName: string | null = null;
  let botCategory: VisitorBotCategory = "human";
  let botVerification: VisitorBotVerification = "not_applicable";
  let automationScore = 5;

  const knownBot = KNOWN_BOTS.find((candidate) => candidate.pattern.test(userAgent));
  if (knownBot) {
    botName = knownBot.name;
    botCategory = knownBot.category;
    botVerification = "self_declared";
    automationScore = knownBot.category === "monitoring" ? 35 : 70;
    reasons.push(`User-Agent matches ${knownBot.name}.`);
  }

  if (!userAgent) {
    botName = botName || "Missing User-Agent";
    botCategory = botCategory === "human" ? "unknown" : botCategory;
    botVerification = botVerification === "not_applicable" ? "unknown" : botVerification;
    automationScore = Math.max(automationScore, 45);
    reasons.push("Request has no User-Agent.");
  }

  if (SCANNER_PATH_PATTERNS.some((pattern) => pattern.test(path))) {
    botName = botName || "Likely scanner";
    botCategory = "scanner";
    botVerification = botVerification === "not_applicable" ? "unknown" : botVerification;
    automationScore = Math.max(automationScore, 85);
    reasons.push("Path matches common scanner target.");
  }

  if (botCategory === "human") {
    reasons.push("No known bot or scanner signal matched.");
  }

  return {
    botName,
    botCategory,
    botVerification,
    automationScore: Math.max(0, Math.min(100, automationScore)),
    reasons,
  };
}

export function hashVisitorIp(visitorIp: string | null, salt: string) {
  if (!visitorIp) return null;
  return crypto.createHmac("sha256", salt).update(visitorIp).digest("hex");
}

export function visitorIpPrefix(visitorIp: string | null) {
  if (!visitorIp) return null;

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(visitorIp)) {
    const parts = visitorIp.split(".");
    return `${parts.slice(0, 3).join(".")}.0/24`;
  }

  if (visitorIp.includes(":")) {
    return `${visitorIp.split(":").slice(0, 4).join(":")}::/64`;
  }

  return null;
}

export function normalizeVisitorIngestEvents(payload: VisitorIngestPayload, options: {
  fallbackSiteOrigin?: string | null;
  fallbackUserAgent?: string | null;
  ipHashSalt: string;
}) {
  const fallbackSiteOrigin = cleanString(options.fallbackSiteOrigin, 400);
  const rawEvents = Array.isArray(payload.events) ? payload.events : [payload];

  if (!rawEvents.length) {
    throw new Error("At least one visitor event is required.");
  }

  return rawEvents.slice(0, MAX_EVENTS_PER_REQUEST).map((rawEvent) => {
    const event = asRecord(rawEvent);
    const siteOrigin = cleanString(event.siteOrigin, 400) || cleanString(payload.siteOrigin, 400) || fallbackSiteOrigin;
    const normalizedUrl = normalizeUrl(siteOrigin, event.pageUrl, event.path);
    const userAgent = cleanString(event.userAgent, 800) || cleanString(options.fallbackUserAgent, 800);
    const visitorIp = cleanString(event.visitorIp, 120);
    const classification = classifyVisitor({ userAgent, path: normalizedUrl.path });

    return {
      eventType: parseEventType(event.eventType),
      source: parseSource(event.source),
      occurredAt: parseOccurredAt(event.occurredAt),
      siteOrigin: normalizedUrl.siteOrigin,
      pageUrl: normalizedUrl.pageUrl,
      path: normalizedUrl.path,
      method: cleanString(event.method, 12)?.toUpperCase() || null,
      statusCode: parseStatusCode(event.statusCode),
      referrer: cleanString(event.referrer, 1200),
      userAgent,
      visitorIpHash: hashVisitorIp(visitorIp, options.ipHashSalt),
      visitorIpPrefix: visitorIpPrefix(visitorIp),
      country: cleanString(event.country, 80),
      asn: cleanString(event.asn, 80),
      classification,
      requestHeaders: sanitizeVisitorHeaders(event.requestHeaders),
      metadata: safeMetadata(event.metadata),
    } satisfies VisitorIngestEvent;
  });
}

export function visitorEventRow(userId: string, event: VisitorIngestEvent) {
  return {
    id: randomUUID(),
    user_id: userId,
    site_origin: event.siteOrigin,
    event_type: event.eventType,
    source: event.source,
    occurred_at: event.occurredAt,
    page_url: event.pageUrl,
    path: event.path,
    method: event.method,
    status_code: event.statusCode,
    referrer: event.referrer,
    user_agent: event.userAgent,
    visitor_ip_hash: event.visitorIpHash,
    visitor_ip_prefix: event.visitorIpPrefix,
    country: event.country,
    asn: event.asn,
    bot_name: event.classification.botName,
    bot_category: event.classification.botCategory,
    bot_verification: event.classification.botVerification,
    automation_score: event.classification.automationScore,
    classification_reasons: event.classification.reasons,
    request_headers_json: event.requestHeaders,
    metadata_json: event.metadata,
    received_at: new Date().toISOString(),
  };
}
