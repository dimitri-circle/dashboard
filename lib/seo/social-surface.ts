import { load } from "cheerio";
import { validatePublicWebsiteUrl, type WebsiteSurfaceIssue, type WebsiteSurfaceSeverity } from "./website-surface";

export type SocialSurfaceProfileStatus = "ok" | "blocked" | "error";
export type SocialSurfaceResultStatus = "healthy" | "partial" | "blocked" | "failed";

export type SocialSurfaceProfile = {
  platform: string;
  url: string;
  status: SocialSurfaceProfileStatus;
  httpStatus: number | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  signals: string[];
  error?: string;
};

export type SocialSurfaceResult = {
  siteUrl: string;
  checkedAt: string;
  status: SocialSurfaceResultStatus;
  summary: {
    discoveredProfiles: number;
    checkedProfiles: number;
    blockedProfiles: number;
    issues: number;
  };
  profiles: SocialSurfaceProfile[];
  issues: WebsiteSurfaceIssue[];
};

type SocialSurfaceInput = {
  siteUrl: string;
  profileUrls: string[];
};

type SocialPlatform = {
  name: string;
  hosts: string[];
};

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { name: "X", hosts: ["x.com", "twitter.com"] },
  { name: "LinkedIn", hosts: ["linkedin.com"] },
  { name: "Facebook", hosts: ["facebook.com"] },
  { name: "Instagram", hosts: ["instagram.com"] },
  { name: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { name: "TikTok", hosts: ["tiktok.com"] },
  { name: "Threads", hosts: ["threads.net"] },
  { name: "Bluesky", hosts: ["bsky.app"] },
  { name: "GitHub", hosts: ["github.com"] },
  { name: "Medium", hosts: ["medium.com"] },
];

const MAX_PROFILE_URLS = 8;
const MAX_HTML_BYTES = 600_000;
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "CircleClick Social Surface Check/1.0";

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

export function normalizeSocialSurfaceInput(body: unknown): SocialSurfaceInput {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  return {
    siteUrl: String(value.siteUrl || "").trim(),
    profileUrls: splitList(value.profileUrls).slice(0, MAX_PROFILE_URLS),
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

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hostnameMatches(hostname: string, rootHost: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return normalized === rootHost || normalized.endsWith(`.${rootHost}`);
}

function resolveSocialPlatform(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return SOCIAL_PLATFORMS.find((platform) => platform.hosts.some((host) => hostnameMatches(hostname, host))) || null;
}

function normalizeSocialProfileUrl(rawUrl: string, baseUrl?: URL) {
  const candidate = baseUrl ? new URL(rawUrl, baseUrl) : validatePublicWebsiteUrl(rawUrl);
  const publicUrl = validatePublicWebsiteUrl(candidate.toString());
  const platform = resolveSocialPlatform(publicUrl);

  if (!platform) {
    return null;
  }

  publicUrl.hash = "";
  return {
    platform: platform.name,
    url: publicUrl.toString(),
  };
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
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

function collectSocialLinks(homepageHtml: string, baseUrl: URL) {
  const $ = load(homepageHtml);
  const links: SocialSurfaceProfile[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = String($(element).attr("href") || "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) {
      return;
    }

    try {
      const profile = normalizeSocialProfileUrl(href, baseUrl);
      if (!profile || seen.has(profile.url)) {
        return;
      }

      seen.add(profile.url);
      links.push({
        platform: profile.platform,
        url: profile.url,
        status: "error",
        httpStatus: null,
        title: null,
        description: null,
        canonical: null,
        signals: ["Discovered from homepage link"],
      });
    } catch {
      return;
    }
  });

  return links.slice(0, MAX_PROFILE_URLS);
}

function parseProfileHtml(html: string) {
  const $ = load(html);
  const title = normalizeWhitespace($("head > title").first().text() || $('meta[property="og:title"]').first().attr("content") || "");
  const description = normalizeWhitespace(
    $('meta[name="description"]').first().attr("content") || $('meta[property="og:description"]').first().attr("content") || ""
  );
  const canonical = String($('link[rel="canonical"]').first().attr("href") || "").trim();

  return {
    title: title || null,
    description: description || null,
    canonical: canonical || null,
  };
}

async function checkProfile(profile: SocialSurfaceProfile, issues: WebsiteSurfaceIssue[]): Promise<SocialSurfaceProfile> {
  try {
    const response = await fetchWithTimeout(profile.url);
    const httpStatus = response.status;

    if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
      addIssue(
        issues,
        "medium",
        `${profile.platform} profile blocks public crawl`,
        `The profile returned HTTP ${httpStatus}; treat social data as partial.`,
        profile.url
      );
      return {
        ...profile,
        status: "blocked",
        httpStatus,
        signals: [...profile.signals, `HTTP ${httpStatus}`],
      };
    }

    if (httpStatus >= 400) {
      addIssue(issues, "medium", `${profile.platform} profile could not be read`, `The profile returned HTTP ${httpStatus}.`, profile.url);
      return {
        ...profile,
        status: "error",
        httpStatus,
        signals: [...profile.signals, `HTTP ${httpStatus}`],
      };
    }

    const html = await readTextWithLimit(response);
    const metadata = parseProfileHtml(html);
    const bodyText = normalizeWhitespace(load(html)("body").text()).toLowerCase();
    const blockedByContent = /\b(sign in|log in|enable javascript|captcha|temporarily restricted)\b/i.test(bodyText);
    const signals = [...profile.signals];

    if (blockedByContent) {
      addIssue(
        issues,
        "low",
        `${profile.platform} profile may be gated`,
        "The public response mentions sign-in, JavaScript, or restriction language.",
        profile.url
      );
      signals.push("Possible sign-in or JavaScript gate");
    }

    if (!metadata.title) {
      addIssue(issues, "low", `${profile.platform} title missing`, "The public profile response did not expose a title.", profile.url);
    }

    if (!metadata.description) {
      addIssue(
        issues,
        "low",
        `${profile.platform} description missing`,
        "The public profile response did not expose a description.",
        profile.url
      );
    }

    if (metadata.title || metadata.description) {
      signals.push("Public metadata visible");
    }

    return {
      ...profile,
      ...metadata,
      status: blockedByContent ? "blocked" : "ok",
      httpStatus,
      signals,
    };
  } catch (error) {
    addIssue(
      issues,
      "medium",
      `${profile.platform} profile fetch failed`,
      error instanceof Error ? error.message : "The public profile could not be fetched.",
      profile.url
    );
    return {
      ...profile,
      status: "error",
      httpStatus: null,
      error: error instanceof Error ? error.message : "Fetch failed.",
      signals: [...profile.signals, "Fetch failed"],
    };
  }
}

export async function runSocialSurfaceScan(input: SocialSurfaceInput): Promise<SocialSurfaceResult> {
  const baseUrl = validatePublicWebsiteUrl(input.siteUrl);
  const issues: WebsiteSurfaceIssue[] = [];
  const profilesByUrl = new Map<string, SocialSurfaceProfile>();

  let discoveredProfiles = 0;
  try {
    const response = await fetchWithTimeout(baseUrl.toString());
    const homepageHtml = await readTextWithLimit(response);
    const discovered = collectSocialLinks(homepageHtml, baseUrl);
    discoveredProfiles = discovered.length;
    discovered.forEach((profile) => profilesByUrl.set(profile.url, profile));
  } catch (error) {
    addIssue(
      issues,
      "medium",
      "Homepage social discovery failed",
      error instanceof Error ? error.message : "The homepage could not be checked for social links.",
      baseUrl.toString()
    );
  }

  for (const rawUrl of input.profileUrls) {
    let normalized: { platform: string; url: string } | null = null;
    try {
      normalized = normalizeSocialProfileUrl(rawUrl);
    } catch (error) {
      addIssue(
        issues,
        "low",
        "Social URL skipped",
        error instanceof Error ? error.message : "The supplied social URL could not be checked.",
        rawUrl
      );
      continue;
    }

    if (!normalized) {
      addIssue(
        issues,
        "low",
        "Unsupported social URL skipped",
        "Only public social profile URLs for the supported platforms are scanned.",
        rawUrl
      );
      continue;
    }

    if (!profilesByUrl.has(normalized.url)) {
      profilesByUrl.set(normalized.url, {
        platform: normalized.platform,
        url: normalized.url,
        status: "error",
        httpStatus: null,
        title: null,
        description: null,
        canonical: null,
        signals: ["Added manually"],
      });
    }
  }

  const candidates = Array.from(profilesByUrl.values()).slice(0, MAX_PROFILE_URLS);
  if (!candidates.length) {
    addIssue(
      issues,
      "high",
      "No public social profiles found",
      "No supported social links were discovered on the homepage and no supported profile URLs were supplied.",
      baseUrl.toString()
    );
  }

  const profiles = await Promise.all(candidates.map((profile) => checkProfile(profile, issues)));
  const blockedProfiles = profiles.filter((profile) => profile.status === "blocked").length;
  const errorProfiles = profiles.filter((profile) => profile.status === "error").length;
  const status: SocialSurfaceResultStatus = !profiles.length
    ? "failed"
    : blockedProfiles + errorProfiles === profiles.length
      ? "blocked"
      : issues.length || blockedProfiles || errorProfiles
        ? "partial"
        : "healthy";

  return {
    siteUrl: baseUrl.toString(),
    checkedAt: new Date().toISOString(),
    status,
    summary: {
      discoveredProfiles,
      checkedProfiles: profiles.length,
      blockedProfiles,
      issues: issues.length,
    },
    profiles,
    issues,
  };
}
