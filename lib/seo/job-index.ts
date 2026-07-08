import crypto from "node:crypto";
import { load } from "cheerio";

export const DEFAULT_VAST_JOB_INDEX_URL = "https://vast.ai/jobs";

const JOB_INDEX_TIMEOUT_MS = 8_000;
const MAX_JOB_INDEX_BYTES = 850_000;

export type VastJobIndexChangeKind =
  | "role_added"
  | "role_removed"
  | "title"
  | "location"
  | "workplace"
  | "employment_type"
  | "compensation"
  | "apply_url"
  | "description";

export type VastJobIndexRole = {
  id: string;
  slug: string;
  title: string;
  team: string | null;
  department: string | null;
  location: string | null;
  workplace: string | null;
  employmentType: string | null;
  compensation: string | null;
  compensationSummary: string | null;
  applyUrl: string | null;
  summary: string | null;
  descriptionHash: string;
  descriptionSample: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currencyCode: string | null;
};

export type VastJobIndexSnapshot = {
  version: 1;
  sourceUrl: string;
  sourceOrigin: string;
  capturedAt: string;
  httpStatus: number | null;
  ok: boolean;
  pageTitle: string | null;
  canonical: string | null;
  robots: string | null;
  noindex: boolean;
  structuredJobPosting: boolean;
  nextDataJobs: boolean;
  googleIndexStatus: "unknown";
  roles: VastJobIndexRole[];
};

export type VastJobIndexChange = {
  kind: VastJobIndexChangeKind;
  severity: "high" | "medium" | "low";
  roleId: string;
  title: string;
  label: string;
  detail: string;
  before: string | null;
  after: string | null;
};

export type VastJobIndexResult = {
  sourceUrl: string;
  checkedAt: string;
  status: "baseline" | "unchanged" | "changed" | "failed";
  summary: {
    openRoles: number;
    addedRoles: number;
    removedRoles: number;
    changedRoles: number;
    compensationChanges: number;
    locationChanges: number;
    applyUrlChanges: number;
    missingApplyUrls: number;
    noindex: boolean;
    googleIndexKnown: boolean;
  };
  snapshot: VastJobIndexSnapshot;
  changes: VastJobIndexChange[];
};

export type VastJobIndexInput = {
  sourceUrl?: string;
};

type RawVastJob = Record<string, unknown>;

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function nullableText(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stableHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function absoluteUrl(value: unknown, baseUrl: string) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;

  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractDescriptionText(descriptionHtml: unknown, fallback: unknown) {
  const html = cleanText(descriptionHtml);
  const fallbackText = cleanText(fallback);
  if (!html) return fallbackText;

  const $ = load(html);
  return cleanText($("body").text() || $.root().text() || fallbackText);
}

function normalizeRawJob(job: RawVastJob, sourceUrl: string): VastJobIndexRole | null {
  const title = cleanText(job.title);
  if (!title) return null;

  const rawId = cleanText(job.id);
  const slug = cleanText(job.slug) || slugify(`${title}-${rawId || ""}`);
  const id = rawId || slug || slugify(title);
  const salary = job.salaryDetails && typeof job.salaryDetails === "object" ? (job.salaryDetails as Record<string, unknown>) : {};
  const descriptionText = extractDescriptionText(job.descriptionHtml, job.summary);

  return {
    id,
    slug,
    title,
    team: nullableText(job.team),
    department: nullableText(job.department),
    location: nullableText(job.location),
    workplace: nullableText(job.workplace),
    employmentType: nullableText(job.employmentType),
    compensation: nullableText(job.compensation),
    compensationSummary: nullableText(job.compensationSummary),
    applyUrl: absoluteUrl(job.applyUrl, sourceUrl),
    summary: nullableText(job.summary),
    descriptionHash: stableHash(descriptionText),
    descriptionSample: descriptionText ? descriptionText.slice(0, 320) : null,
    salaryMin: numberOrNull(salary.minValue),
    salaryMax: numberOrNull(salary.maxValue),
    currencyCode: nullableText(salary.currencyCode),
  };
}

function extractNextDataJobs(html: string) {
  const $ = load(html);
  const raw = $("#__NEXT_DATA__").text();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { props?: { pageProps?: { jobs?: unknown } } };
    return Array.isArray(parsed.props?.pageProps?.jobs) ? (parsed.props.pageProps.jobs as RawVastJob[]) : [];
  } catch {
    return [];
  }
}

function extractJsonLdHasJobPosting(html: string) {
  const $ = load(html);
  return $("script[type='application/ld+json']")
    .toArray()
    .some((script) => /"@type"\s*:\s*"JobPosting"|JobPosting/i.test($(script).text()));
}

function fallbackVisibleRoles(html: string, sourceUrl: string) {
  const $ = load(html);
  const roles: VastJobIndexRole[] = [];

  $("h3").each((_, heading) => {
    const rawTitle = cleanText($(heading).text()).replace(/New$/i, "").trim();
    if (!rawTitle || /products|developers|resources|community|contact|don't see your role/i.test(rawTitle)) {
      return;
    }

    const summary = cleanText($(heading).next("p").text());
    const meta = cleanText($(heading).next("p").next("p").text());
    const slug = slugify(rawTitle);
    const descriptionText = [summary, meta].filter(Boolean).join(" ");
    roles.push({
      id: slug,
      slug,
      title: rawTitle,
      team: null,
      department: null,
      location: meta || null,
      workplace: null,
      employmentType: null,
      compensation: null,
      compensationSummary: meta || null,
      applyUrl: null,
      summary: summary || null,
      descriptionHash: stableHash(descriptionText),
      descriptionSample: descriptionText ? descriptionText.slice(0, 320) : null,
      salaryMin: null,
      salaryMax: null,
      currencyCode: null,
    });
  });

  return roles.filter((role) => role.title && !role.title.includes("|")).map((role) => ({ ...role, applyUrl: role.applyUrl || null }));
}

export function normalizeVastJobIndexInput(input: unknown): Required<VastJobIndexInput> {
  const candidate = typeof input === "object" && input ? (input as { sourceUrl?: unknown }).sourceUrl : undefined;
  const sourceUrl = cleanText(candidate) || DEFAULT_VAST_JOB_INDEX_URL;

  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("Vast Job Index source URL must be a valid URL.");
  }

  if (url.protocol !== "https:" || url.hostname !== "vast.ai" || url.pathname.replace(/\/+$/, "") !== "/jobs") {
    throw new Error("Vast Job Index only supports https://vast.ai/jobs.");
  }

  url.hash = "";
  return { sourceUrl: url.toString() };
}

export function parseVastJobIndexHtml(html: string, sourceUrl = DEFAULT_VAST_JOB_INDEX_URL, fetchedAt = new Date().toISOString(), httpStatus: number | null = 200): VastJobIndexSnapshot {
  const $ = load(html);
  const robots = $("meta[name='robots'], meta[name='googlebot']")
    .map((_, element) => $(element).attr("content"))
    .get()
    .filter(Boolean)
    .join(", ");
  const canonical = absoluteUrl($('link[rel="canonical"]').first().attr("href"), sourceUrl);
  const nextJobs = extractNextDataJobs(html);
  const nextRoles = nextJobs.map((job) => normalizeRawJob(job, sourceUrl)).filter((role): role is VastJobIndexRole => Boolean(role));
  const roles = nextRoles.length ? nextRoles : fallbackVisibleRoles(html, sourceUrl);
  const source = new URL(sourceUrl);

  return {
    version: 1,
    sourceUrl,
    sourceOrigin: source.origin,
    capturedAt: fetchedAt,
    httpStatus,
    ok: Boolean(httpStatus && httpStatus >= 200 && httpStatus < 400 && roles.length),
    pageTitle: nullableText($("title").first().text()),
    canonical,
    robots: robots || null,
    noindex: /noindex/i.test(robots),
    structuredJobPosting: extractJsonLdHasJobPosting(html),
    nextDataJobs: nextRoles.length > 0,
    googleIndexStatus: "unknown",
    roles,
  };
}

function roleKey(role: VastJobIndexRole) {
  return role.slug || role.id || slugify(role.title);
}

function pushChange(
  changes: VastJobIndexChange[],
  role: VastJobIndexRole,
  kind: VastJobIndexChangeKind,
  severity: VastJobIndexChange["severity"],
  label: string,
  before: string | null,
  after: string | null
) {
  changes.push({
    kind,
    severity,
    roleId: role.id,
    title: role.title,
    label,
    detail: `${label} changed for ${role.title}.`,
    before,
    after,
  });
}

function compareField(
  changes: VastJobIndexChange[],
  previous: VastJobIndexRole,
  current: VastJobIndexRole,
  kind: VastJobIndexChangeKind,
  severity: VastJobIndexChange["severity"],
  label: string,
  before: string | null,
  after: string | null
) {
  if ((before || "") !== (after || "")) {
    pushChange(changes, current, kind, severity, label, before, after);
  }
}

export function compareVastJobIndexSnapshots(
  current: VastJobIndexSnapshot,
  previous: VastJobIndexSnapshot | null
): VastJobIndexResult {
  const changes: VastJobIndexChange[] = [];

  if (previous) {
    const previousByKey = new Map(previous.roles.map((role) => [roleKey(role), role]));
    const currentByKey = new Map(current.roles.map((role) => [roleKey(role), role]));

    for (const role of current.roles) {
      const prior = previousByKey.get(roleKey(role));
      if (!prior) {
        pushChange(changes, role, "role_added", "high", "Role added", null, role.title);
        continue;
      }

      compareField(changes, prior, role, "title", "high", "Title", prior.title, role.title);
      compareField(changes, prior, role, "location", "medium", "Location", prior.location, role.location);
      compareField(changes, prior, role, "workplace", "medium", "Workplace", prior.workplace, role.workplace);
      compareField(changes, prior, role, "employment_type", "medium", "Employment type", prior.employmentType, role.employmentType);
      compareField(changes, prior, role, "compensation", "high", "Compensation", prior.compensation, role.compensation);
      compareField(changes, prior, role, "apply_url", "high", "Apply URL", prior.applyUrl, role.applyUrl);

      if (prior.descriptionHash !== role.descriptionHash) {
        pushChange(changes, role, "description", "medium", "Description", prior.descriptionSample, role.descriptionSample);
      }
    }

    for (const role of previous.roles) {
      if (!currentByKey.has(roleKey(role))) {
        pushChange(changes, role, "role_removed", "high", "Role removed", role.title, null);
      }
    }
  }

  const changedRoleIds = new Set(changes.map((change) => change.roleId));
  const summary = {
    openRoles: current.roles.length,
    addedRoles: changes.filter((change) => change.kind === "role_added").length,
    removedRoles: changes.filter((change) => change.kind === "role_removed").length,
    changedRoles: changedRoleIds.size,
    compensationChanges: changes.filter((change) => change.kind === "compensation").length,
    locationChanges: changes.filter((change) => change.kind === "location").length,
    applyUrlChanges: changes.filter((change) => change.kind === "apply_url").length,
    missingApplyUrls: current.roles.filter((role) => !role.applyUrl).length,
    noindex: current.noindex,
    googleIndexKnown: false,
  };

  return {
    sourceUrl: current.sourceUrl,
    checkedAt: current.capturedAt,
    status: current.ok ? (!previous ? "baseline" : changes.length ? "changed" : "unchanged") : "failed",
    summary,
    snapshot: current,
    changes,
  };
}

async function fetchTextWithLimit(sourceUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JOB_INDEX_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "CircleClick Vast Job Index Watch/1.0",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (text.length > MAX_JOB_INDEX_BYTES) {
      throw new Error("Vast Job Index response is too large to scan safely.");
    }
    return { text, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

export async function runVastJobIndexScan(input: VastJobIndexInput = {}, previousSnapshot: VastJobIndexSnapshot | null = null) {
  const normalized = normalizeVastJobIndexInput(input);
  const checkedAt = new Date().toISOString();
  const { text, status } = await fetchTextWithLimit(normalized.sourceUrl);
  const snapshot = parseVastJobIndexHtml(text, normalized.sourceUrl, checkedAt, status);
  return compareVastJobIndexSnapshots(snapshot, previousSnapshot);
}
