import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/seo/db";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import {
  normalizeVisitorIngestEvents,
  visitorEventRow,
  type VisitorBotCategory,
  type VisitorBotVerification,
} from "@/lib/seo/visitor-intelligence";

export const runtime = "nodejs";

type VisitorEventRow = {
  id: string;
  site_origin: string;
  event_type: "request" | "pageview";
  source: string;
  occurred_at: string;
  received_at: string;
  page_url: string;
  path: string;
  method: string | null;
  status_code: number | null;
  referrer: string | null;
  user_agent: string | null;
  country: string | null;
  asn: string | null;
  bot_name: string | null;
  bot_category: VisitorBotCategory;
  bot_verification: VisitorBotVerification;
  automation_score: number;
  classification_reasons: string[];
};

const VISITOR_STORAGE_NOT_READY_MESSAGE =
  "Visitor Intelligence storage is not installed yet. Apply supabase/migrations/20260702143000_visitor_intelligence_contract.sql to save visitor and bot events.";

function isVisitorStorageMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Could not find the table|schema cache|relation .*seo_visitor_events/i.test(message);
}

function getConfiguredIngestSecret() {
  return process.env.SEO_VISITOR_INGEST_SECRET || process.env.VISITOR_INTELLIGENCE_INGEST_SECRET || "";
}

function getRequestIngestSecret(request: Request) {
  const directHeader = request.headers.get("x-seo-visitor-secret") || "";
  const authorization = request.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return directHeader.trim();
}

function safeSecretEqual(actual: string, expected: string) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedCounts(map: Map<string, number>, limit: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function summarizeRows(rows: VisitorEventRow[], windowDays: number) {
  const botCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const pageCounts = new Map<string, number>();
  let requestEvents = 0;
  let pageviewEvents = 0;
  let botEvents = 0;
  let humanEvents = 0;
  let aiCrawlerEvents = 0;
  let scannerEvents = 0;
  let selfDeclaredBots = 0;
  let verifiedBots = 0;

  for (const row of rows) {
    if (row.event_type === "pageview") pageviewEvents += 1;
    if (row.event_type === "request") requestEvents += 1;

    increment(categoryCounts, row.bot_category || "unknown");
    increment(pageCounts, row.path || "/");

    if (row.bot_category === "human") {
      humanEvents += 1;
    } else {
      botEvents += 1;
      increment(botCounts, row.bot_name || row.bot_category || "Unknown automation");
    }

    if (row.bot_category === "ai") aiCrawlerEvents += 1;
    if (row.bot_category === "scanner") scannerEvents += 1;
    if (row.bot_verification === "self_declared") selfDeclaredBots += 1;
    if (row.bot_verification === "verified") verifiedBots += 1;
  }

  return {
    storageReady: true,
    storageError: null,
    windowDays,
    totalEvents: rows.length,
    requestEvents,
    pageviewEvents,
    botEvents,
    humanEvents,
    aiCrawlerEvents,
    scannerEvents,
    selfDeclaredBots,
    verifiedBots,
    topBots: sortedCounts(botCounts, 8),
    categories: sortedCounts(categoryCounts, 8),
    topPages: sortedCounts(pageCounts, 8),
    recentEvents: rows.slice(0, 12).map((row) => ({
      id: row.id,
      siteOrigin: row.site_origin,
      eventType: row.event_type,
      source: row.source,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
      pageUrl: row.page_url,
      path: row.path,
      method: row.method,
      statusCode: row.status_code,
      referrer: row.referrer,
      userAgent: row.user_agent,
      country: row.country,
      asn: row.asn,
      botName: row.bot_name,
      botCategory: row.bot_category,
      botVerification: row.bot_verification,
      automationScore: row.automation_score,
      classificationReasons: row.classification_reasons || [],
    })),
    contract: {
      endpointPath: "/api/seo/visitor-intelligence",
      clientHeader: "x-seo-client-id",
      secretHeader: "x-seo-visitor-secret",
      secretEnvVar: "SEO_VISITOR_INGEST_SECRET",
      maxEventsPerRequest: 25,
      mode: "server-to-server",
    },
  };
}

export async function GET(request: Request) {
  try {
    rateLimitFromRequest(request, "visitor-intelligence.summary", 30, 60_000);
    const scope = getTenantScopeFromRequest(request);
    const url = new URL(request.url);
    const windowDays = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || 7) || 7));
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await getSupabaseAdminClient()
      .from("seo_visitor_events")
      .select(
        "id,site_origin,event_type,source,occurred_at,received_at,page_url,path,method,status_code,referrer,user_agent,country,asn,bot_name,bot_category,bot_verification,automation_score,classification_reasons"
      )
      .eq("user_id", scope.userId)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(5000);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(summarizeRows((data || []) as VisitorEventRow[], windowDays));
  } catch (error) {
    if (isVisitorStorageMissing(error)) {
      return NextResponse.json({
        storageReady: false,
        storageError: VISITOR_STORAGE_NOT_READY_MESSAGE,
        windowDays: 7,
        totalEvents: 0,
        requestEvents: 0,
        pageviewEvents: 0,
        botEvents: 0,
        humanEvents: 0,
        aiCrawlerEvents: 0,
        scannerEvents: 0,
        selfDeclaredBots: 0,
        verifiedBots: 0,
        topBots: [],
        categories: [],
        topPages: [],
        recentEvents: [],
        contract: {
          endpointPath: "/api/seo/visitor-intelligence",
          clientHeader: "x-seo-client-id",
          secretHeader: "x-seo-visitor-secret",
          secretEnvVar: "SEO_VISITOR_INGEST_SECRET",
          maxEventsPerRequest: 25,
          mode: "server-to-server",
        },
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load visitor intelligence." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "visitor-intelligence.ingest", 120, 60_000);
    const configuredSecret = getConfiguredIngestSecret();

    if (!configuredSecret) {
      return NextResponse.json(
        { error: "SEO_VISITOR_INGEST_SECRET is required before visitor telemetry can be ingested." },
        { status: 503 }
      );
    }

    if (!safeSecretEqual(getRequestIngestSecret(request), configuredSecret)) {
      return NextResponse.json({ error: "Unauthorized visitor telemetry request." }, { status: 401 });
    }

    const scope = getTenantScopeFromRequest(request);
    const payload = await request.json();
    const events = normalizeVisitorIngestEvents(payload, {
      fallbackSiteOrigin: request.headers.get("origin"),
      fallbackUserAgent: request.headers.get("user-agent"),
      ipHashSalt: process.env.SEO_VISITOR_IP_HASH_SALT || configuredSecret,
    });
    const rows = events.map((event) => visitorEventRow(scope.userId, event));
    const { error } = await getSupabaseAdminClient().from("seo_visitor_events").insert(rows);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(
      {
        accepted: rows.length,
        botEvents: rows.filter((row) => row.bot_category !== "human").length,
        humanEvents: rows.filter((row) => row.bot_category === "human").length,
      },
      { status: 202 }
    );
  } catch (error) {
    if (isVisitorStorageMissing(error)) {
      return NextResponse.json({ error: VISITOR_STORAGE_NOT_READY_MESSAGE }, { status: 503 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to ingest visitor telemetry." },
      { status: 400 }
    );
  }
}
