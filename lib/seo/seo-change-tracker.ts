import crypto from "node:crypto";
import { load } from "cheerio";
import { normalizeSurfacePages, validatePublicWebsiteUrl, type WebsiteSurfaceSeverity } from "./website-surface";

export type SeoChangeKind =
  | "status"
  | "title"
  | "metaDescription"
  | "canonical"
  | "robots"
  | "h1"
  | "openGraph"
  | "copy"
  | "page";

export type SeoPageSnapshot = {
  url: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robots: string | null;
  h1: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  wordCount: number;
  copyHash: string;
  copySample: string;
};

export type SeoChangeRecord = {
  kind: SeoChangeKind;
  severity: WebsiteSurfaceSeverity;
  label: string;
  detail: string;
  before: string | null;
  after: string | null;
  url: string;
};

export type SeoChangeTrackerBaseline = {
  version: 1;
  siteUrl: string;
  capturedAt: string;
  pages: SeoPageSnapshot[];
};

export type SeoChangeTrackerResult = {
  siteUrl: string;
  checkedAt: string;
  status: "baseline" | "unchanged" | "changed" | "failed";
  summary: {
    pagesChecked: number;
    changedPages: number;
    metadataChanges: number;
    copyChanges: number;
    technicalChanges: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  pages: Array<SeoPageSnapshot & { changes: SeoChangeRecord[] }>;
  changes: SeoChangeRecord[];
  baseline: SeoChangeTrackerBaseline;
};

type SeoChangeTrackerInput = {
  siteUrl: string;
  pages?: string[];
  baseline?: SeoChangeTrackerBaseline | null;
};

const MAX_HTML_BYTES = 1_200_000;
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "CircleClick SEO Change Tracker/1.0";

function splitList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseBaseline(value: unknown): SeoChangeTrackerBaseline | null {
  if (!value) return null;

  const candidate = typeof value === "string" ? JSON.parse(value) : value;
  if (!candidate || typeof candidate !== "object") return null;

  const baseline = candidate as Partial<SeoChangeTrackerBaseline>;
  if (baseline.version !== 1 || typeof baseline.siteUrl !== "string" || !Array.isArray(baseline.pages)) {
    throw new Error("SEO tracker baseline is not valid.");
  }

  return baseline as SeoChangeTrackerBaseline;
}

export function normalizeSeoChangeTrackerInput(body: unknown): SeoChangeTrackerInput {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  return {
    siteUrl: String(value.siteUrl || "").trim(),
    pages: splitList(value.pages),
    baseline: parseBaseline(value.baseline),
  };
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
        "user-agent": USER_AGENT,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readTextWithLimit(response: Response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_HTML_BYTES) {
    throw new Error(`Response is too large (${contentLength} bytes).`);
  }

  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;

    const next = value.slice(0, Math.max(0, MAX_HTML_BYTES - received));
    received += value.length;
    text += decoder.decode(next, { stream: true });

    if (received >= MAX_HTML_BYTES) {
      await reader.cancel();
      break;
    }
  }

  text += decoder.decode();
  return text;
}

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stableHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function absoluteUrl(rawUrl: string, baseUrl: string) {
  if (!rawUrl.trim()) return null;

  try {
    const url = new URL(rawUrl, baseUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

async function crawlSeoSnapshot(url: string): Promise<SeoPageSnapshot> {
  const snapshot: SeoPageSnapshot = {
    url,
    finalUrl: url,
    status: null,
    ok: false,
    title: null,
    metaDescription: null,
    canonical: null,
    robots: null,
    h1: null,
    ogTitle: null,
    ogDescription: null,
    wordCount: 0,
    copyHash: "",
    copySample: "",
  };

  try {
    const response = await fetchWithTimeout(url);
    snapshot.finalUrl = response.url || url;
    snapshot.status = response.status;
    snapshot.ok = response.ok;

    if (!response.ok) {
      return snapshot;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("text/plain")) {
      return snapshot;
    }

    const html = await readTextWithLimit(response);
    const $ = load(html);
    $("script, style, noscript, svg").remove();

    const bodyCopy = normalizedText($("body").text());
    const robots = $("meta[name='robots'], meta[name='googlebot']")
      .map((_, element) => String($(element).attr("content") || ""))
      .get()
      .map(normalizedText)
      .filter(Boolean)
      .join(", ");

    snapshot.title = normalizedText($("head > title").first().text()) || null;
    snapshot.metaDescription = normalizedText($('meta[name="description"]').first().attr("content") || "") || null;
    snapshot.canonical = absoluteUrl(String($('link[rel="canonical"]').first().attr("href") || ""), snapshot.finalUrl);
    snapshot.robots = robots || null;
    snapshot.h1 = normalizedText($("h1").first().text()) || null;
    snapshot.ogTitle = normalizedText($('meta[property="og:title"]').first().attr("content") || "") || null;
    snapshot.ogDescription = normalizedText($('meta[property="og:description"]').first().attr("content") || "") || null;
    snapshot.wordCount = bodyCopy ? bodyCopy.split(/\s+/).length : 0;
    snapshot.copyHash = stableHash(bodyCopy);
    snapshot.copySample = bodyCopy.slice(0, 220);
  } catch {
    return snapshot;
  }

  return snapshot;
}

function pushChange(
  changes: SeoChangeRecord[],
  url: string,
  kind: SeoChangeKind,
  severity: WebsiteSurfaceSeverity,
  label: string,
  before: string | null,
  after: string | null,
  detail: string
) {
  changes.push({ kind, severity, label, before, after, detail, url });
}

function compareField(
  changes: SeoChangeRecord[],
  url: string,
  kind: SeoChangeKind,
  label: string,
  before: string | null,
  after: string | null,
  severity: WebsiteSurfaceSeverity
) {
  if ((before || "") === (after || "")) return;

  pushChange(
    changes,
    url,
    kind,
    severity,
    label,
    before,
    after,
    `${label} changed from ${before || "blank"} to ${after || "blank"}.`
  );
}

function comparePage(current: SeoPageSnapshot, baseline?: SeoPageSnapshot) {
  const changes: SeoChangeRecord[] = [];

  if (!baseline) {
    pushChange(changes, current.url, "page", "medium", "New tracked page", null, current.finalUrl, "This page was not in the previous baseline.");
    return changes;
  }

  if (baseline.status !== current.status) {
    pushChange(
      changes,
      current.url,
      "status",
      current.status && current.status >= 500 ? "critical" : "high",
      "HTTP status changed",
      baseline.status === null ? null : String(baseline.status),
      current.status === null ? null : String(current.status),
      "The crawled HTTP status changed."
    );
  }

  compareField(changes, current.url, "title", "Title", baseline.title, current.title, "high");
  compareField(changes, current.url, "metaDescription", "Meta description", baseline.metaDescription, current.metaDescription, "high");
  compareField(changes, current.url, "canonical", "Canonical URL", baseline.canonical, current.canonical, "high");
  compareField(changes, current.url, "robots", "Robots metadata", baseline.robots, current.robots, /noindex/i.test(current.robots || "") ? "high" : "medium");
  compareField(changes, current.url, "h1", "H1", baseline.h1, current.h1, "medium");
  compareField(changes, current.url, "openGraph", "Open Graph title", baseline.ogTitle, current.ogTitle, "medium");
  compareField(changes, current.url, "openGraph", "Open Graph description", baseline.ogDescription, current.ogDescription, "medium");

  if (baseline.copyHash !== current.copyHash) {
    const delta = current.wordCount - baseline.wordCount;
    pushChange(
      changes,
      current.url,
      "copy",
      "medium",
      "Page copy changed",
      `${baseline.wordCount} words`,
      `${current.wordCount} words`,
      `Visible page copy changed. Word count delta: ${delta > 0 ? "+" : ""}${delta}.`
    );
  }

  return changes;
}

function countChanges(changes: SeoChangeRecord[], severity: WebsiteSurfaceSeverity) {
  return changes.filter((change) => change.severity === severity).length;
}

export async function runSeoChangeTracker(input: SeoChangeTrackerInput): Promise<SeoChangeTrackerResult> {
  const baseUrl = validatePublicWebsiteUrl(input.siteUrl);
  const pageUrls = normalizeSurfacePages(baseUrl.toString(), input.pages);
  const currentPages = await Promise.all(pageUrls.map((pageUrl) => crawlSeoSnapshot(pageUrl)));
  const baselineUrl = input.baseline ? validatePublicWebsiteUrl(input.baseline.siteUrl) : null;
  const canCompare = baselineUrl ? baselineUrl.origin === baseUrl.origin : false;
  const previousPages = new Map((canCompare ? input.baseline?.pages || [] : []).map((page) => [page.url, page]));
  const pages = currentPages.map((page) => ({
    ...page,
    changes: canCompare ? comparePage(page, previousPages.get(page.url)) : [],
  }));
  const changes = pages.flatMap((page) => page.changes);
  const changedPages = new Set(changes.map((change) => change.url)).size;
  const checkedAt = new Date().toISOString();
  const baseline: SeoChangeTrackerBaseline = {
    version: 1,
    siteUrl: baseUrl.toString(),
    capturedAt: checkedAt,
    pages: currentPages,
  };

  const summary = {
    pagesChecked: pages.length,
    changedPages,
    metadataChanges: changes.filter((change) => change.kind !== "copy" && change.kind !== "page").length,
    copyChanges: changes.filter((change) => change.kind === "copy").length,
    technicalChanges: changes.filter((change) => change.kind === "status" || change.kind === "robots" || change.kind === "canonical").length,
    critical: countChanges(changes, "critical"),
    high: countChanges(changes, "high"),
    medium: countChanges(changes, "medium"),
    low: countChanges(changes, "low"),
  };

  return {
    siteUrl: baseUrl.toString(),
    checkedAt,
    status: !canCompare ? "baseline" : changes.length ? "changed" : "unchanged",
    summary,
    pages,
    changes,
    baseline,
  };
}
