import crypto from "node:crypto";
import { load } from "cheerio";
import { validatePublicWebsiteUrl, type WebsiteSurfaceSeverity } from "./website-surface";

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

export type SeoChangeTrackerInput = {
  siteUrl: string;
  pages?: string[];
  baseline?: SeoChangeTrackerBaseline | null;
};

const MAX_HTML_BYTES = 1_200_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_TRACKED_PAGES = 16;
const MAX_SITEMAPS_TO_READ = 6;
const USER_AGENT = "CircleClick SEO Change Tracker/1.0";
const HTML_ACCEPT = "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5";
const XML_ACCEPT = "application/xml,text/xml,text/plain;q=0.8,*/*;q=0.5";
const NON_PAGE_EXTENSION_PATTERN =
  /\.(?:avif|css|csv|doc|docx|gif|ico|jpeg|jpg|js|json|mp3|mp4|mov|pdf|png|rss|svg|txt|webm|webp|xls|xlsx|xml|zip)$/i;

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

export function normalizeSeoChangeTrackerSite(rawSiteUrl: string) {
  const baseUrl = validatePublicWebsiteUrl(rawSiteUrl);
  return {
    siteUrl: baseUrl.toString(),
    siteOrigin: baseUrl.origin,
  };
}

async function fetchWithTimeout(url: string, accept = HTML_ACCEPT) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept,
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

function normalizeSameOriginUrl(rawUrl: string, baseUrl: URL, { allowNonPage = false } = {}) {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("#") || /^(mailto|tel|javascript):/i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    if (url.origin !== baseUrl.origin || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return null;
    }

    url.hash = "";
    if (!allowNonPage && NON_PAGE_EXTENSION_PATTERN.test(url.pathname)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function addUniqueUrl(urls: string[], seen: Set<string>, url: string | null) {
  if (!url || seen.has(url) || urls.length >= MAX_TRACKED_PAGES) {
    return;
  }

  seen.add(url);
  urls.push(url);
}

function normalizePriorityPageUrls(baseUrl: URL, pages: string[] = []) {
  const urls: string[] = [];
  const seen = new Set<string>();

  addUniqueUrl(urls, seen, baseUrl.toString());
  for (const page of pages) {
    addUniqueUrl(urls, seen, normalizeSameOriginUrl(page, baseUrl));
  }

  return urls;
}

function extractSitemapLocations(xml: string, baseUrl: URL) {
  const $ = load(xml, { xmlMode: true });
  const pageUrls: string[] = [];
  const sitemapUrls: string[] = [];
  const pageSeen = new Set<string>();
  const sitemapSeen = new Set<string>();

  $("url > loc").each((_, element) => {
    addUniqueUrl(pageUrls, pageSeen, normalizeSameOriginUrl(String($(element).text() || ""), baseUrl));
  });

  $("sitemap > loc").each((_, element) => {
    addUniqueUrl(
      sitemapUrls,
      sitemapSeen,
      normalizeSameOriginUrl(String($(element).text() || ""), baseUrl, { allowNonPage: true })
    );
  });

  return { pageUrls, sitemapUrls };
}

async function fetchSitemapPageUrls(sitemapUrl: string, baseUrl: URL, visited = new Set<string>()): Promise<string[]> {
  if (visited.has(sitemapUrl) || visited.size >= MAX_SITEMAPS_TO_READ) {
    return [];
  }

  visited.add(sitemapUrl);

  try {
    const response = await fetchWithTimeout(sitemapUrl, XML_ACCEPT);
    if (!response.ok) return [];

    const xml = await readTextWithLimit(response);
    if (!/<(?:urlset|sitemapindex|url|sitemap)\b/i.test(xml)) {
      return [];
    }

    const { pageUrls, sitemapUrls } = extractSitemapLocations(xml, baseUrl);
    if (pageUrls.length) {
      return pageUrls;
    }

    const nestedUrls: string[] = [];
    const nestedSeen = new Set<string>();
    for (const nestedSitemap of sitemapUrls.slice(0, MAX_SITEMAPS_TO_READ)) {
      const pages = await fetchSitemapPageUrls(nestedSitemap, baseUrl, visited);
      for (const page of pages) {
        addUniqueUrl(nestedUrls, nestedSeen, page);
      }
      if (nestedUrls.length >= MAX_TRACKED_PAGES) break;
    }

    return nestedUrls;
  } catch {
    return [];
  }
}

async function findSitemapCandidates(baseUrl: URL) {
  const candidates: string[] = [];
  const seen = new Set<string>();

  try {
    const robotsUrl = new URL("/robots.txt", baseUrl).toString();
    const response = await fetchWithTimeout(robotsUrl, "text/plain,*/*;q=0.5");
    if (response.ok) {
      const robots = await readTextWithLimit(response);
      for (const line of robots.split(/\r?\n/)) {
        const match = line.match(/^\s*sitemap:\s*(.+?)\s*$/i);
        if (match) {
          addUniqueUrl(candidates, seen, normalizeSameOriginUrl(match[1], baseUrl, { allowNonPage: true }));
        }
      }
    }
  } catch {
    // Sitemap discovery falls back to common sitemap paths.
  }

  addUniqueUrl(candidates, seen, normalizeSameOriginUrl("/sitemap.xml", baseUrl, { allowNonPage: true }));
  addUniqueUrl(candidates, seen, normalizeSameOriginUrl("/sitemap_index.xml", baseUrl, { allowNonPage: true }));

  return candidates;
}

async function discoverSitemapPageUrls(baseUrl: URL) {
  const urls: string[] = [];
  const seen = new Set<string>();
  const sitemapCandidates = await findSitemapCandidates(baseUrl);

  for (const sitemapUrl of sitemapCandidates) {
    const pages = await fetchSitemapPageUrls(sitemapUrl, baseUrl);
    for (const page of pages) {
      addUniqueUrl(urls, seen, page);
    }
    if (urls.length >= MAX_TRACKED_PAGES) break;
  }

  return urls;
}

async function discoverNavigationPageUrls(baseUrl: URL) {
  try {
    const response = await fetchWithTimeout(baseUrl.toString());
    if (!response.ok) return [];

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("text/plain")) {
      return [];
    }

    const html = await readTextWithLimit(response);
    const $ = load(html);
    const urls: string[] = [];
    const seen = new Set<string>();

    $("nav a[href], header a[href], [role='navigation'] a[href]").each((_, element) => {
      addUniqueUrl(urls, seen, normalizeSameOriginUrl(String($(element).attr("href") || ""), baseUrl));
    });

    if (!urls.length) {
      $("a[href]").each((_, element) => {
        addUniqueUrl(urls, seen, normalizeSameOriginUrl(String($(element).attr("href") || ""), baseUrl));
      });
    }

    return urls;
  } catch {
    return [];
  }
}

async function discoverSeoChangeTrackerPageUrls(baseUrl: URL, pages: string[] = []) {
  const urls: string[] = [];
  const seen = new Set<string>();
  const priorityUrls = normalizePriorityPageUrls(baseUrl, pages);
  const sitemapUrls = await discoverSitemapPageUrls(baseUrl);
  const discoveredUrls = sitemapUrls.length ? sitemapUrls : await discoverNavigationPageUrls(baseUrl);

  for (const url of [...priorityUrls, ...discoveredUrls]) {
    addUniqueUrl(urls, seen, url);
  }

  return urls;
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
  const pageUrls = await discoverSeoChangeTrackerPageUrls(baseUrl, input.pages);
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
