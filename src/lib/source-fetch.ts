import type { AnalysisRequest, EvidenceSource } from "@/app/types";

const MAX_SOURCE_CHARS = 9000;
const FETCH_TIMEOUT_MS = 8000;

function normalizeUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("URL is required");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  return url.href;
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeEntities(titleMatch?.[1]?.replace(/\s+/g, " ").trim() || "Untitled page");
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  ).slice(0, MAX_SOURCE_CHARS);
}

async function fetchSource(name: string, rawUrl: string, pageType: EvidenceSource["pageType"]) {
  let url = "";

  try {
    url = normalizeUrl(rawUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "CircleClickCompetitiveAnalysis/0.1"
      }
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      throw new Error(`Fetch failed with HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error(`Unsupported content type: ${contentType || "unknown"}`);
    }

    const html = await response.text();
    const title = contentType.includes("text/html") ? extractTitle(html) : name;
    const textPreview = contentType.includes("text/html") ? htmlToText(html) : html.slice(0, MAX_SOURCE_CHARS);

    return {
      name,
      url,
      title,
      pageType,
      status: "fetched",
      textPreview
    } satisfies EvidenceSource;
  } catch (error) {
    return {
      name,
      url: url || rawUrl,
      title: "Source unavailable",
      pageType,
      status: "failed",
      textPreview: "",
      error: error instanceof Error ? error.message : "Unknown fetch error"
    } satisfies EvidenceSource;
  }
}

export async function collectEvidence(input: AnalysisRequest) {
  const sources = [
    fetchSource(input.companyName || "Company", input.companyUrl, "company"),
    ...input.competitors.map((competitor) =>
      fetchSource(competitor.name || competitor.url, competitor.url, "competitor")
    )
  ];

  return Promise.all(sources);
}
