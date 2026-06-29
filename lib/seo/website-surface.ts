import { isIP } from "node:net";
import { load } from "cheerio";

export type WebsiteSurfaceSeverity = "critical" | "high" | "medium" | "low";

export type WebsiteSurfaceIssue = {
  severity: WebsiteSurfaceSeverity;
  title: string;
  detail: string;
  url?: string;
};

export type WebsiteSurfacePageResult = {
  url: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  missingAltCount: number;
  internalLinksFound: number;
  issues: WebsiteSurfaceIssue[];
};

export type WebsiteSurfaceResult = {
  siteUrl: string;
  checkedAt: string;
  status: "healthy" | "warning" | "failed";
  summary: {
    pagesChecked: number;
    linksChecked: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  pages: WebsiteSurfacePageResult[];
  issues: WebsiteSurfaceIssue[];
};

type WebsiteSurfaceInput = {
  siteUrl: string;
  pages?: string[];
  expectedText?: string[];
};

const MAX_PAGES = 8;
const MAX_LINK_CHECKS = 12;
const MAX_HTML_BYTES = 1_200_000;
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "CircleClick Website Surface Check/1.0";

function isPrivateIpv4(parts: number[]) {
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  const ipVersion = isIP(normalized);

  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    return true;
  }

  if (normalized === "metadata.google.internal") {
    return true;
  }

  if (ipVersion === 4) {
    return isPrivateIpv4(normalized.split(".").map((part) => Number(part)));
  }

  if (ipVersion === 6) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

export function validatePublicWebsiteUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw new Error("Site URL is required.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Site URL must be a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Site URL must use http or https.");
  }

  if (url.username || url.password) {
    throw new Error("Site URL must not include embedded credentials.");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error("Site URL cannot target local, private, or metadata hosts.");
  }

  url.hash = "";
  return url;
}

export function normalizeSurfacePages(siteUrl: string, pages: string[] = []) {
  const base = validatePublicWebsiteUrl(siteUrl);
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const rawPage of ["", ...pages]) {
    const trimmed = rawPage.trim();
    const pageUrl = trimmed ? new URL(trimmed, base) : base;

    if (pageUrl.origin !== base.origin) {
      throw new Error("Surface check pages must stay on the same site origin.");
    }

    if (isBlockedHostname(pageUrl.hostname)) {
      throw new Error("Surface check pages cannot target local, private, or metadata hosts.");
    }

    pageUrl.hash = "";
    const normalized = pageUrl.toString();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }

    if (urls.length >= MAX_PAGES) {
      break;
    }
  }

  return urls;
}

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

export function normalizeWebsiteSurfaceInput(body: unknown): WebsiteSurfaceInput {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const siteUrl = String(value.siteUrl || "").trim();
  return {
    siteUrl,
    pages: splitList(value.pages),
    expectedText: splitList(value.expectedText).slice(0, 8),
  };
}

function addIssue(
  issues: WebsiteSurfaceIssue[],
  severity: WebsiteSurfaceSeverity,
  title: string,
  detail: string,
  url?: string
) {
  issues.push({ severity, title, detail, url });
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set("user-agent", USER_AGENT);
  headers.set("accept", "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5");

  try {
    return await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers,
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
  if (!reader) {
    return "";
  }

  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

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

function collectInternalLinks($: ReturnType<typeof load>, baseUrl: URL) {
  const links: string[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = String($(element).attr("href") || "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) {
      return;
    }

    try {
      const linkUrl = new URL(href, baseUrl);
      linkUrl.hash = "";

      if (linkUrl.origin !== baseUrl.origin || isBlockedHostname(linkUrl.hostname)) {
        return;
      }

      const normalized = linkUrl.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch {
      return;
    }
  });

  return links;
}

async function checkLink(url: string) {
  try {
    const head = await fetchWithTimeout(url, { method: "HEAD" });
    if (head.status !== 405 && head.status !== 403) {
      return head.status;
    }

    const get = await fetchWithTimeout(url, { method: "GET" });
    return get.status;
  } catch {
    return null;
  }
}

async function checkAsset(baseUrl: URL, path: string, label: string, issues: WebsiteSurfaceIssue[]) {
  const assetUrl = new URL(path, baseUrl).toString();

  try {
    const response = await fetchWithTimeout(assetUrl, { method: "GET" });
    if (response.status >= 400) {
      addIssue(issues, "medium", `${label} is unavailable`, `${path} returned HTTP ${response.status}.`, assetUrl);
    }
  } catch {
    addIssue(issues, "low", `${label} could not be checked`, `${path} did not respond before timeout.`, assetUrl);
  }
}

async function checkPage(url: string, expectedText: string[]) {
  const issues: WebsiteSurfaceIssue[] = [];
  const pageResult: WebsiteSurfacePageResult = {
    url,
    finalUrl: url,
    status: null,
    ok: false,
    title: null,
    metaDescription: null,
    h1Count: 0,
    missingAltCount: 0,
    internalLinksFound: 0,
    issues,
  };

  try {
    const response = await fetchWithTimeout(url, { method: "GET" });
    pageResult.finalUrl = response.url || url;
    pageResult.status = response.status;
    pageResult.ok = response.ok;

    if (response.status >= 500) {
      addIssue(issues, "critical", "Page has a server error", `HTTP ${response.status} returned.`, url);
      return pageResult;
    }

    if (response.status >= 400) {
      addIssue(issues, "high", "Page is unavailable", `HTTP ${response.status} returned.`, url);
      return pageResult;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("text/plain")) {
      addIssue(issues, "medium", "Page is not HTML", `Content-Type was ${contentType || "unknown"}.`, url);
      return pageResult;
    }

    const html = await readTextWithLimit(response);
    const $ = load(html);
    const title = normalizedText($("head > title").first().text());
    const metaDescription = normalizedText($('meta[name="description"]').first().attr("content") || "");
    const canonical = String($('link[rel="canonical"]').first().attr("href") || "").trim();
    const robots = $("meta[name='robots'], meta[name='googlebot']")
      .map((_, element) => String($(element).attr("content") || ""))
      .get()
      .join(",");
    const h1s = $("h1")
      .map((_, element) => normalizedText($(element).text()))
      .get()
      .filter(Boolean);
    const missingAltCount = $("img")
      .toArray()
      .filter((element) => !String($(element).attr("alt") || "").trim()).length;
    const bodyText = normalizedText($("body").text()).toLowerCase();
    const baseUrl = new URL(pageResult.finalUrl);
    const internalLinks = collectInternalLinks($, baseUrl);

    pageResult.title = title || null;
    pageResult.metaDescription = metaDescription || null;
    pageResult.h1Count = h1s.length;
    pageResult.missingAltCount = missingAltCount;
    pageResult.internalLinksFound = internalLinks.length;

    if (!title) {
      addIssue(issues, "high", "Missing page title", "The page has no <title> tag.", url);
    } else if (title.length < 12 || title.length > 70) {
      addIssue(issues, "low", "Title length needs review", `Title is ${title.length} characters.`, url);
    }

    if (!metaDescription) {
      addIssue(issues, "medium", "Missing meta description", "Search and social previews may be weak.", url);
    } else if (metaDescription.length < 40 || metaDescription.length > 170) {
      addIssue(issues, "low", "Meta description length needs review", `Description is ${metaDescription.length} characters.`, url);
    }

    if (!canonical) {
      addIssue(issues, "medium", "Missing canonical URL", "The page has no canonical link tag.", url);
    }

    if (/noindex/i.test(robots)) {
      addIssue(issues, "high", "Page is marked noindex", "Robots metadata tells crawlers not to index this page.", url);
    }

    if (h1s.length === 0) {
      addIssue(issues, "high", "Missing H1", "The page has no visible H1 heading.", url);
    } else if (h1s.length > 1) {
      addIssue(issues, "medium", "Multiple H1 headings", `Found ${h1s.length} H1 headings.`, url);
    }

    if (missingAltCount > 0) {
      addIssue(issues, missingAltCount > 5 ? "medium" : "low", "Images are missing alt text", `${missingAltCount} image(s) need alt text.`, url);
    }

    if (!$('meta[property="og:title"]').length || !$('meta[property="og:description"]').length) {
      addIssue(issues, "low", "Open Graph metadata is incomplete", "Social previews may not render cleanly.", url);
    }

    for (const expected of expectedText) {
      if (expected && !bodyText.includes(expected.toLowerCase())) {
        addIssue(issues, "medium", "Expected text was not found", `"${expected}" was not found in the page body.`, url);
      }
    }
  } catch (error) {
    addIssue(
      issues,
      "critical",
      "Page could not be fetched",
      error instanceof Error ? error.message : "Fetch failed before the page could be read.",
      url
    );
  }

  return pageResult;
}

function countIssues(issues: WebsiteSurfaceIssue[], severity: WebsiteSurfaceSeverity) {
  return issues.filter((issue) => issue.severity === severity).length;
}

export async function runWebsiteSurfaceCheck(input: WebsiteSurfaceInput): Promise<WebsiteSurfaceResult> {
  const baseUrl = validatePublicWebsiteUrl(input.siteUrl);
  const pageUrls = normalizeSurfacePages(baseUrl.toString(), input.pages);
  const expectedText = input.expectedText || [];
  const pages = await Promise.all(pageUrls.map((pageUrl) => checkPage(pageUrl, expectedText)));
  const issues = pages.flatMap((page) => page.issues);
  const linkCandidates = Array.from(
    new Set(
      pages
        .filter((page) => page.ok)
        .flatMap((page) => page.url)
    )
  );

  await checkAsset(baseUrl, "/robots.txt", "Robots file", issues);
  await checkAsset(baseUrl, "/sitemap.xml", "Sitemap", issues);

  const linkChecks = new Set<string>();
  for (const page of pages) {
    if (!page.ok || linkChecks.size >= MAX_LINK_CHECKS) {
      continue;
    }

    try {
      const response = await fetchWithTimeout(page.url, { method: "GET" });
      const html = await readTextWithLimit(response);
      const $ = load(html);
      const links = collectInternalLinks($, new URL(page.finalUrl)).slice(0, MAX_LINK_CHECKS);

      for (const link of links) {
        if (linkChecks.size >= MAX_LINK_CHECKS || linkChecks.has(link) || linkCandidates.includes(link)) {
          continue;
        }

        linkChecks.add(link);
        const status = await checkLink(link);
        if (status === null || status >= 400) {
          addIssue(
            issues,
            "high",
            "Internal link may be broken",
            status === null ? "The link did not respond before timeout." : `The link returned HTTP ${status}.`,
            link
          );
        }
      }
    } catch {
      continue;
    }
  }

  const summary = {
    pagesChecked: pages.length,
    linksChecked: linkChecks.size,
    critical: countIssues(issues, "critical"),
    high: countIssues(issues, "high"),
    medium: countIssues(issues, "medium"),
    low: countIssues(issues, "low"),
  };

  return {
    siteUrl: baseUrl.toString(),
    checkedAt: new Date().toISOString(),
    status: summary.critical > 0 ? "failed" : summary.high > 0 || summary.medium > 0 ? "warning" : "healthy",
    summary,
    pages,
    issues,
  };
}
