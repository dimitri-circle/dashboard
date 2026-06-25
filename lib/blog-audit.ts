import { lookup } from "node:dns/promises";
import net from "node:net";
import { load } from "cheerio";

export type BlogAuditRecommendation = "PASS" | "PASS_WITH_EDITS" | "DO_NOT_PUBLISH";
export type BlogAuditClaimStatus = "PASS" | "FAIL" | "UNSUPPORTED" | "STALE_RISK" | "BLOCKED";
export type BlogAuditFormat = "markdown" | "plain_text" | "html" | "url";

export type BlogAuditInput = {
  title?: string;
  format?: string;
  content?: string;
  url?: string;
};

export type BlogAuditClaim = {
  claim: string;
  status: BlogAuditClaimStatus;
  reason: string;
  evidence: string[];
  suggestedRewrite: string;
};

export type BlogAuditBrandFinding = {
  issue: string;
  severity: "low" | "medium" | "high";
  suggestedRewrite: string;
};

export type BlogAuditReport = {
  recommendation: BlogAuditRecommendation;
  truthScore: number;
  brandScore: number;
  summary: string;
  claims: BlogAuditClaim[];
  brandFindings: BlogAuditBrandFinding[];
  missingEvidence: string[];
  publishRisks: string[];
  externalEvidence: BlogAuditExternalEvidenceSummary;
};

type VastSourceKind = "docs" | "site" | "inventory" | "brand" | "social";

export type VastAuditSource = {
  id: string;
  name: string;
  url: string;
  kind: VastSourceKind;
  required: boolean;
  timeSensitive?: boolean;
  approvedFeedOnly?: boolean;
};

export type VastSourceResult = VastAuditSource & {
  status: "ok" | "blocked" | "error";
  fetchedAt: string;
  text: string;
  error?: string;
};

type AuditOptions = {
  sources?: VastSourceResult[];
  externalEvidence?: ExternalEvidenceResult[];
};

type ExternalEvidenceStatus = Extract<BlogAuditClaimStatus, "PASS" | "FAIL" | "UNSUPPORTED" | "STALE_RISK">;
type ExternalEvidenceRunStatus = "NOT_NEEDED" | "UNAVAILABLE" | "CHECKED" | "FAILED";

export type BlogAuditExternalEvidenceSummary = {
  status: ExternalEvidenceRunStatus;
  message: string;
  checkedClaims: number;
  supportedClaims: number;
  evidenceUrls: string[];
};

type ExternalEvidenceResult = {
  claim: string;
  status: ExternalEvidenceStatus;
  reason: string;
  evidence: string[];
  suggestedRewrite?: string;
};

type ExternalEvidenceState = BlogAuditExternalEvidenceSummary & {
  results: ExternalEvidenceResult[];
};

const BLOG_TEXT_LIMIT = 120_000;
const MAX_FETCH_BYTES = 700_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CLAIMS = 32;
const MAX_EXTERNAL_EVIDENCE_CLAIMS = 8;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "can",
  "for",
  "from",
  "has",
  "have",
  "how",
  "into",
  "its",
  "more",
  "not",
  "our",
  "that",
  "the",
  "their",
  "then",
  "there",
  "this",
  "through",
  "use",
  "using",
  "vast",
  "vastai",
  "with",
  "you",
  "your",
]);

const FACT_PATTERNS = [
  /\b(vast\.ai|vast ai|vastai|vast)\b/i,
  /\b(gpu|gpus|nvidia|rtx|a100|h100|h200|b200|l40s|v100|qwen|llama|pytorch|docker|ssh|api|template|instance|instances)\b/i,
  /\b(pricing|price|cost|available|availability|uptime|performance|latency|compliance|soc 2|hipaa|gdpr|secure|security)\b/i,
  /\b(offers?|provides?|supports?|includes?|allows?|enables?|runs?|deploys?|connects?|charges?|starts?|founded|certified)\b/i,
  /\$|\b\d+(?:[.,]\d+)?%?\b/,
];

const TIME_SENSITIVE_PATTERNS = [
  /\b(price|pricing|cost|costs|cheap|cheaper|cheapest|available|availability|inventory|stock|current|today|now|latest)\b/i,
  /\$|\bper\s+hour\b|\b\/hr\b/i,
];

const HARD_OVERPROMISE_PATTERNS = [
  /\bguarantee[sd]?\b/i,
  /\b100%\s*(uptime|availability|secure|compliant|reliable)\b/i,
  /\balways\s+(available|cheaper|faster|best|secure)\b/i,
  /\balways\b.{0,80}\b(available|cheaper|cheapest|faster|best|secure)\b/i,
  /\bcheapest\b.{0,80}\b(available|gpu|gpus|pricing|price)\b/i,
  /\bnever\s+(fails|down|unavailable)\b/i,
  /\bunlimited\b/i,
];

const SUPERLATIVE_PATTERNS = [/\bbest\b/i, /\bfastest\b/i, /\bcheapest\b/i, /\bmost\s+\w+/i, /\bunbeatable\b/i, /\bindustry-leading\b/i];
const HYPE_PATTERNS = [/\brevolutionary\b/i, /\bgame[- ]changing\b/i, /\binsane\b/i, /\bmagic\b/i, /\bworld[- ]class\b/i];
const PRODUCT_NAME_PATTERNS = [/\bVastAI\b/i, /\bVast AI\b/i, /\bvast ai\b/i];

export function getVastAuditSources(): VastAuditSource[] {
  const sources: VastAuditSource[] = [
    {
      id: "docs-llms",
      name: "Vast docs knowledge",
      url: "https://docs.vast.ai/llms.txt",
      kind: "docs",
      required: true,
    },
    {
      id: "site-llms",
      name: "Vast public site knowledge",
      url: "https://vast.ai/llms.txt",
      kind: "site",
      required: true,
    },
    {
      id: "site-llms-full",
      name: "Vast full site knowledge",
      url: "https://vast.ai/llms-full.txt",
      kind: "site",
      required: true,
    },
    {
      id: "pricing-api",
      name: "Live Vast inventory and pricing",
      url: "https://vast.ai/api/vast-pricing",
      kind: "inventory",
      required: true,
      timeSensitive: true,
    },
    {
      id: "press-kit",
      name: "Vast press kit",
      url: "https://vast.ai/press-kit",
      kind: "brand",
      required: true,
    },
    {
      id: "x-official",
      name: "Official X public messaging",
      url: process.env.VAST_X_FEED_URL || "https://x.com/vast_ai",
      kind: "social",
      required: false,
    },
  ];

  if (process.env.VAST_LINKEDIN_FEED_URL) {
    sources.push({
      id: "linkedin-approved-feed",
      name: "Approved LinkedIn feed",
      url: process.env.VAST_LINKEDIN_FEED_URL,
      kind: "social",
      required: false,
      approvedFeedOnly: true,
    });
  }

  return sources;
}

export async function auditBlogDraft(input: BlogAuditInput, options: AuditOptions = {}): Promise<BlogAuditReport> {
  const normalizedInput = validateBlogAuditInput(input);
  const cleanText = await extractBlogText(normalizedInput);
  const claims = splitFactualClaims(cleanText);
  const sources = options.sources || (await fetchVastAuditSources());
  const baseClaimFindings = claims.map((claim) => auditClaim(claim, sources));
  const externalEvidence =
    options.externalEvidence
      ? buildExternalEvidenceState("CHECKED", "External evidence checked.", options.externalEvidence, options.externalEvidence.length)
      : await fetchExternalEvidenceForClaims(baseClaimFindings, sources);
  const claimFindings = applyExternalEvidence(baseClaimFindings, externalEvidence);
  const brandFindings = auditBrand(cleanText);
  const missingEvidence = buildMissingEvidence(claimFindings, sources, claims, externalEvidence);
  const publishRisks = buildPublishRisks(claimFindings, brandFindings, sources, externalEvidence);
  const truthScore = scoreTruth(claimFindings, sources);
  const brandScore = scoreBrand(brandFindings);
  const recommendation = recommendPublication(truthScore, brandScore, claimFindings, brandFindings, sources);

  return {
    recommendation,
    truthScore,
    brandScore,
    summary: summarizeAudit(recommendation, truthScore, brandScore, claimFindings, brandFindings),
    claims: claimFindings,
    brandFindings,
    missingEvidence,
    publishRisks,
    externalEvidence: externalEvidenceSummary(externalEvidence),
  };
}

export function validateBlogAuditInput(input: BlogAuditInput): BlogAuditInput & {
  format: BlogAuditFormat;
  content: string;
  url: string;
} {
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const format = !content && url ? "url" : normalizeFormat(input.format);

  if (format === "url" && !content && !url) {
    throw new Error("URL input requires content or url.");
  }

  if (format !== "url" && !content) {
    throw new Error("Blog audit content is required.");
  }

  if (content.length > BLOG_TEXT_LIMIT) {
    throw new Error(`Blog audit content must be ${BLOG_TEXT_LIMIT} characters or less.`);
  }

  return { ...input, format, content, url };
}

export function normalizeFormat(format: unknown): BlogAuditFormat {
  const value = typeof format === "string" ? format.trim().toLowerCase().replace(/-/g, "_") : "plain_text";

  if (value === "markdown" || value === "md") return "markdown";
  if (value === "plain" || value === "plain_text" || value === "text") return "plain_text";
  if (value === "html") return "html";
  if (value === "url") return "url";

  throw new Error("format must be markdown, plain_text, html, or url.");
}

export async function extractBlogText(input: BlogAuditInput & { format: BlogAuditFormat; content: string; url: string }) {
  if (input.format === "url") {
    const url = input.url || input.content || "";
    await assertPublicUrl(url);
    const fetched = await fetchText(url, MAX_FETCH_BYTES);
    return cleanExtractedText(fetched.text, fetched.contentType);
  }

  return cleanExtractedText(input.content || "", input.format === "html" ? "text/html" : "text/plain", input.format);
}

export function cleanExtractedText(rawText: string, contentType = "", format?: BlogAuditFormat) {
  const normalized = rawText.replace(/\0/g, " ").slice(0, BLOG_TEXT_LIMIT);
  const shouldParseHtml = format === "html" || /html/i.test(contentType) || /<\s*(html|body|article|main|p|h1|h2|div)\b/i.test(normalized);

  if (shouldParseHtml) {
    const $ = load(normalized);
    const metaText = [
      $("title").first().text(),
      $("meta[name='description']").attr("content"),
      $("meta[property='og:description']").attr("content"),
      ...$("script[type='application/ld+json']")
        .map((_, element) => $(element).text())
        .get(),
    ]
      .filter(Boolean)
      .join(" ");
    $("script,style,noscript,svg,header,footer,nav").remove();
    return normalizeWhitespace(`${metaText} ${$("body").text() || $.root().text()}`);
  }

  if (format === "markdown") {
    return normalizeWhitespace(
      normalized
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
        .replace(/^#{1,6}\s+.+$/gm, " ")
        .replace(/[*_~>#]+/g, " ")
    );
  }

  return normalizeWhitespace(normalized);
}

export function splitFactualClaims(text: string) {
  const protectedText = text
    .replace(/Vast\.ai/g, "Vast[dot]ai")
    .replace(/docs\.vast\.ai/g, "docs[dot]vast[dot]ai")
    .replace(/vast\.ai/g, "vast[dot]ai");

  const candidates = protectedText
    .replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1\n")
    .split(/\n+/)
    .map((sentence) => normalizeWhitespace(sentence.replace(/\[dot]/g, ".")))
    .map((sentence) => sentence.replace(/^[-*]\s+/, ""))
    .filter((sentence) => sentence.length >= 28 && sentence.length <= 420)
    .filter((sentence) => FACT_PATTERNS.some((pattern) => pattern.test(sentence)));

  return Array.from(new Set(candidates)).slice(0, MAX_CLAIMS);
}

export async function fetchVastAuditSources() {
  const sourceResults: VastSourceResult[] = await Promise.all(
    getVastAuditSources().map(async (source) => {
      try {
        await assertPublicUrl(source.url);
        const fetched = await fetchText(source.url, source.id === "pricing-api" ? MAX_FETCH_BYTES : 350_000);
        const text = source.kind === "inventory" ? summarizePricingSource(fetched.text) : cleanExtractedText(fetched.text, fetched.contentType);

        if (source.id === "x-official" && !hasExtractableXPostText(fetched.text, text)) {
          throw new Error("Official X source did not expose current post text; configure VAST_X_FEED_URL for an approved feed.");
        }

        return {
          ...source,
          status: "ok" as const,
          fetchedAt: new Date().toISOString(),
          text,
        };
      } catch (error) {
        return {
          ...source,
          status: "error" as const,
          fetchedAt: new Date().toISOString(),
          text: "",
          error: error instanceof Error ? error.message : "Unable to fetch source.",
        };
      }
    })
  );

  if (!process.env.VAST_LINKEDIN_FEED_URL) {
    sourceResults.push({
      id: "linkedin-approved-feed",
      name: "Approved LinkedIn feed",
      url: "",
      kind: "social",
      required: false,
      approvedFeedOnly: true,
      status: "blocked",
      fetchedAt: new Date().toISOString(),
      text: "",
      error: "LinkedIn is available only through an approved API, RSS, or JSON feed.",
    });
  }

  return sourceResults;
}

function auditClaim(claim: string, sources: VastSourceResult[]): BlogAuditClaim {
  const evidence = findEvidence(claim, sources);
  const sourceFailures = sources.filter((source) => source.required && source.status !== "ok");
  const isTimeSensitive = isTimeSensitiveClaim(claim);
  const hardOverpromise = HARD_OVERPROMISE_PATTERNS.some((pattern) => pattern.test(claim));
  const supportedByInventory = evidence.some((url) => url.includes("/api/vast-pricing"));

  if (hardOverpromise) {
    return {
      claim,
      status: "FAIL",
      reason: "The claim uses absolute or guaranteed language that cannot be safely proven from current Vast sources.",
      evidence,
      suggestedRewrite: softenClaim(claim),
    };
  }

  if (isTimeSensitive && !sources.some((source) => source.id === "pricing-api" && source.status === "ok")) {
    return {
      claim,
      status: "BLOCKED",
      reason: "The claim depends on live pricing, GPU availability, or current inventory, but the live pricing source was not available.",
      evidence,
      suggestedRewrite: "Verify the current Vast inventory and pricing page, then state the claim with an audit date.",
    };
  }

  if (evidence.length && isTimeSensitive) {
    return {
      claim,
      status: "STALE_RISK",
      reason: supportedByInventory
        ? "The claim is supported by a current Vast source, but pricing and GPU availability can change quickly."
        : "The claim appears in current Vast sources, but it discusses pricing, GPU availability, or current market state.",
      evidence,
      suggestedRewrite: addTimeSensitivity(claim),
    };
  }

  if (evidence.length) {
    return {
      claim,
      status: "PASS",
      reason: "The claim is observable in current Vast sources.",
      evidence,
      suggestedRewrite: "No rewrite required.",
    };
  }

  if (sourceFailures.length === sources.filter((source) => source.required).length) {
    return {
      claim,
      status: "BLOCKED",
      reason: "Required Vast sources could not be fetched, so the claim cannot be verified.",
      evidence: [],
      suggestedRewrite: "Hold this claim until the current Vast sources can be checked.",
    };
  }

  return {
    claim,
    status: "UNSUPPORTED",
    reason: "The claim was not observed in the fetched Vast source set.",
    evidence: [],
    suggestedRewrite: softenClaim(claim),
  };
}

async function fetchExternalEvidenceForClaims(claims: BlogAuditClaim[], sources: VastSourceResult[]): Promise<ExternalEvidenceState> {
  const candidates = claims
    .filter((claim) => claim.status === "UNSUPPORTED")
    .slice(0, MAX_EXTERNAL_EVIDENCE_CLAIMS)
    .map((claim, index) => ({
      id: `c${index + 1}`,
      claim: claim.claim,
    }));

  if (!candidates.length) {
    return buildExternalEvidenceState("NOT_NEEDED", "External evidence was not needed.", [], 0);
  }

  if (process.env.EXTERNAL_EVIDENCE_DISABLED === "1") {
    return buildExternalEvidenceState(
      "UNAVAILABLE",
      "External evidence unavailable: external checks are disabled.",
      [],
      candidates.length
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildExternalEvidenceState(
      "UNAVAILABLE",
      "External evidence unavailable: missing OpenAI key.",
      [],
      candidates.length
    );
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildExternalEvidenceRequest(candidates, sources)),
    });

    if (!response.ok) {
      return buildExternalEvidenceState(
        "FAILED",
        "External evidence unavailable: OpenAI source retrieval failed.",
        [],
        candidates.length
      );
    }

    const payload = await response.json();
    const results = normalizeExternalEvidenceResponse(payload, candidates);
    return buildExternalEvidenceState(
      "CHECKED",
      "External evidence checked.",
      results,
      candidates.length
    );
  } catch {
    return buildExternalEvidenceState(
      "FAILED",
      "External evidence unavailable: OpenAI source retrieval failed.",
      [],
      candidates.length
    );
  }
}

function buildExternalEvidenceRequest(
  candidates: Array<{ id: string; claim: string }>,
  sources: VastSourceResult[]
) {
  const checkedVastSources = sources
    .filter((source) => source.status === "ok" && source.url)
    .map((source) => source.url)
    .slice(0, 8);

  return {
    model: process.env.OPENAI_WEB_SEARCH_MODEL || process.env.OPENAI_SEO_MODEL || "gpt-4.1-mini",
    tools: [
      {
        type: process.env.OPENAI_WEB_SEARCH_TOOL || "web_search",
        search_context_size: process.env.OPENAI_WEB_SEARCH_CONTEXT_SIZE || "low",
      },
    ],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    max_output_tokens: 1400,
    input: buildExternalEvidencePrompt(candidates, checkedVastSources),
  };
}

function buildExternalEvidencePrompt(candidates: Array<{ id: string; claim: string }>, checkedVastSources: string[]) {
  return [
    "Validate only the listed claims using live web sources.",
    "Use web search first. Do not rely on memory.",
    "Prefer official, primary, dated, or vendor-owned sources.",
    "PASS only when a reviewable URL directly supports the exact claim.",
    "FAIL only when a reviewable URL directly contradicts the claim.",
    "STALE_RISK for pricing, availability, inventory, rankings, or current-market claims unless the source is current and dated.",
    "UNSUPPORTED when no reviewable source is found.",
    "Keep reasons under 22 words. Keep rewrites under 24 words.",
    "Return only minified JSON with this shape:",
    '{"results":[{"id":"c1","claim":"...","status":"PASS|FAIL|UNSUPPORTED|STALE_RISK","reason":"...","evidence":["https://..."],"suggestedRewrite":"..."}]}',
    `Already checked Vast URLs: ${JSON.stringify(checkedVastSources)}`,
    `Claims: ${JSON.stringify(candidates)}`,
  ].join("\n");
}

function normalizeExternalEvidenceResponse(
  payload: unknown,
  candidates: Array<{ id: string; claim: string }>
): ExternalEvidenceResult[] {
  const rawText = extractOpenAIOutputText(payload);
  const parsed = parseFirstJsonObject(rawText) as { results?: Array<Record<string, unknown>> } | null;

  if (!parsed || !Array.isArray(parsed.results)) {
    return [];
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate.claim]));
  const candidateByClaim = new Map(candidates.map((candidate) => [normalizeForSearch(candidate.claim), candidate.claim]));
  const fallbackUrls = collectReviewableUrls(payload);

  const normalizedResults: Array<ExternalEvidenceResult | null> = parsed.results.map((result) => {
      const id = typeof result.id === "string" && candidateIds.has(result.id) ? result.id : "";
      const resultClaim = typeof result.claim === "string" ? result.claim : "";
      const claim = id
        ? candidateById.get(id) || resultClaim
        : candidateByClaim.get(normalizeForSearch(resultClaim)) || resultClaim;
      const directEvidence = normalizeEvidenceUrls(result.evidence).slice(0, 4);
      const evidence = directEvidence.length ? directEvidence : fallbackUrls.slice(0, 2);
      const status = normalizeExternalEvidenceStatus(result.status, evidence);
      const reason = typeof result.reason === "string" ? normalizeWhitespace(result.reason).slice(0, 260) : "";
      const suggestedRewrite =
        typeof result.suggestedRewrite === "string" ? normalizeWhitespace(result.suggestedRewrite).slice(0, 260) : "";

      if (!claim || (!id && !candidateByClaim.has(normalizeForSearch(claim)))) {
        return null;
      }

      return {
        claim,
        status,
        reason: reason || "External evidence check completed.",
        evidence: evidence.length ? evidence : status === "UNSUPPORTED" ? [] : fallbackUrls.slice(0, 2),
        suggestedRewrite,
      };
    });

  return normalizedResults
    .filter((result): result is ExternalEvidenceResult => result !== null)
    .filter((result) => result.status === "UNSUPPORTED" || result.evidence.length > 0)
    .slice(0, candidates.length);
}

function applyExternalEvidence(claims: BlogAuditClaim[], externalEvidence: ExternalEvidenceState): BlogAuditClaim[] {
  const evidenceByClaim = new Map(
    externalEvidence.results.map((result) => [normalizeForSearch(result.claim), result])
  );

  return claims.map((claim) => {
    const external = evidenceByClaim.get(normalizeForSearch(claim.claim));

    if (!external) {
      if (claim.status !== "UNSUPPORTED") {
        return claim;
      }

      if (externalEvidence.status === "CHECKED") {
        return {
          ...claim,
          reason: "External evidence checked: no reviewable source found.",
        };
      }

      if (externalEvidence.status === "UNAVAILABLE" || externalEvidence.status === "FAILED") {
        return {
          ...claim,
          status: "BLOCKED",
          reason: externalEvidence.message,
          suggestedRewrite: "Hold this claim until external evidence can be checked.",
        };
      }

      return claim;
    }

    if (external.status === "UNSUPPORTED") {
      return {
        ...claim,
        reason: "External evidence checked: no reviewable source found.",
      };
    }

    return {
      ...claim,
      status: external.status,
      reason: `External evidence check: ${external.reason}`,
      evidence: external.evidence,
      suggestedRewrite: external.suggestedRewrite || (external.status === "PASS" ? "No rewrite required." : softenClaim(claim.claim)),
    };
  });
}

function buildExternalEvidenceState(
  status: ExternalEvidenceRunStatus,
  message: string,
  results: ExternalEvidenceResult[],
  checkedClaims: number
): ExternalEvidenceState {
  const supportedResults = results.filter((result) => result.status !== "UNSUPPORTED" && result.evidence.length > 0);

  return {
    status,
    message,
    checkedClaims,
    supportedClaims: supportedResults.length,
    evidenceUrls: Array.from(new Set(results.flatMap((result) => result.evidence))).slice(0, 12),
    results,
  };
}

function externalEvidenceSummary(state: ExternalEvidenceState): BlogAuditExternalEvidenceSummary {
  const { results: _results, ...summary } = state;
  return summary;
}

function normalizeExternalEvidenceStatus(status: unknown, evidence: string[]): ExternalEvidenceStatus {
  if (!evidence.length) {
    return "UNSUPPORTED";
  }

  if (status === "PASS" || status === "FAIL" || status === "STALE_RISK" || status === "UNSUPPORTED") {
    return status;
  }

  return "UNSUPPORTED";
}

function extractOpenAIOutputText(payload: unknown) {
  const direct = payload && typeof payload === "object" && "output_text" in payload ? (payload as { output_text?: unknown }).output_text : "";
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const chunks: string[] = [];
  collectTextChunks(payload, chunks);
  return chunks.join("\n");
}

function collectTextChunks(value: unknown, chunks: string[]) {
  if (!value || typeof value !== "object") {
    return;
  }

  if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
    chunks.push((value as { text: string }).text);
  }

  if ("output_text" in value && typeof (value as { output_text?: unknown }).output_text === "string") {
    chunks.push((value as { output_text: string }).output_text);
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextChunks(item, chunks));
    return;
  }

  Object.values(value).forEach((item) => collectTextChunks(item, chunks));
}

function parseFirstJsonObject(rawText: string) {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(rawText.slice(start, end + 1));
  } catch {
    return null;
  }
}

function collectReviewableUrls(value: unknown) {
  const urls = new Set<string>();

  function visit(item: unknown) {
    if (!item || typeof item !== "object") {
      return;
    }

    if ("url" in item && typeof (item as { url?: unknown }).url === "string" && isReviewableUrl((item as { url: string }).url)) {
      urls.add((item as { url: string }).url);
    }

    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }

    Object.values(item).forEach(visit);
  }

  visit(value);
  return Array.from(urls).slice(0, 8);
}

function normalizeEvidenceUrls(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(isReviewableUrl)
    )
  );
}

function isReviewableUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !isPrivateHostname(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function hasExtractableXPostText(rawText: string, cleanText: string) {
  if (process.env.VAST_X_FEED_URL && !process.env.VAST_X_FEED_URL.includes("x.com")) {
    return cleanText.length > 120;
  }

  return /data-testid=["']tweetText["']|tweetText|\/vast_ai\/status\//i.test(rawText);
}

function findEvidence(claim: string, sources: VastSourceResult[]) {
  const tokens = importantTokens(claim);
  const evidence = sources
    .filter((source) => source.status === "ok" && source.text)
    .map((source) => {
      const sourceText = normalizeForSearch(source.text);
      const hits = tokens.filter((token) => sourceText.includes(token));
      const modelHits = extractGpuModels(claim).filter((model) => sourceText.includes(model));
      const score = tokens.length ? hits.length / tokens.length : 0;
      const exactChunk = compactClaimPhrase(claim);
      const exactMatch = exactChunk.length > 34 && sourceText.includes(exactChunk);
      const livePricingHit = source.kind === "inventory" && isTimeSensitiveClaim(claim) && modelHits.length > 0;

      return {
        source,
        score: score + (modelHits.length ? 0.25 : 0) + (exactMatch ? 0.35 : 0) + (livePricingHit ? 0.5 : 0),
      };
    })
    .filter(({ score }) => score >= 0.58)
    .sort((a, b) => b.score - a.score)
    .map(({ source }) => source.url)
    .filter(Boolean);

  return Array.from(new Set(evidence)).slice(0, 5);
}

function auditBrand(text: string) {
  const findings: BlogAuditBrandFinding[] = [];

  for (const pattern of PRODUCT_NAME_PATTERNS) {
    if (pattern.test(text)) {
      findings.push({
        issue: "Vast product name is written inconsistently.",
        severity: "medium",
        suggestedRewrite: "Use Vast.ai for the company and product name unless a source title requires another form.",
      });
      break;
    }
  }

  for (const pattern of HARD_OVERPROMISE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        issue: `Overpromising language: "${match[0]}".`,
        severity: "high",
        suggestedRewrite: "Replace absolutes with source-backed, bounded language.",
      });
    }
  }

  for (const pattern of SUPERLATIVE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        issue: `Unsupported superlative: "${match[0]}".`,
        severity: "medium",
        suggestedRewrite: "Use a measurable comparison only when the source and date are stated.",
      });
    }
  }

  for (const pattern of HYPE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        issue: `Hype-driven wording: "${match[0]}".`,
        severity: "low",
        suggestedRewrite: "Use clear, practical language that explains what the user can do.",
      });
    }
  }

  if (/\b(hipaa|gdpr|soc 2|compliance|certified)\b/i.test(text) && !/\b(source|according to|as stated|press kit|docs)\b/i.test(text)) {
    findings.push({
      issue: "Compliance or certification language needs direct source support.",
      severity: "high",
      suggestedRewrite: "Attach the exact Vast source and avoid broad compliance promises.",
    });
  }

  return findings.slice(0, 12);
}

function isTimeSensitiveClaim(claim: string) {
  if (TIME_SENSITIVE_PATTERNS.some((pattern) => pattern.test(claim))) {
    return true;
  }

  return extractGpuModels(claim).length > 0 && /\b(price|pricing|cost|available|availability|inventory|current|today|now|latest)\b/i.test(claim);
}

function buildMissingEvidence(
  claims: BlogAuditClaim[],
  sources: VastSourceResult[],
  extractedClaims: string[],
  externalEvidence: ExternalEvidenceState
) {
  const missing = [
    ...sources
      .filter((source) => source.status !== "ok")
      .map((source) => `${source.name}: ${source.error || "source unavailable"}`),
    ...claims
      .filter((claim) => claim.status === "UNSUPPORTED" || claim.status === "BLOCKED")
      .map((claim) => `Claim needs evidence: ${claim.claim}`),
  ];

  if (externalEvidence.status === "UNAVAILABLE" || externalEvidence.status === "FAILED") {
    missing.push(externalEvidence.message);
  }

  if (!extractedClaims.length) {
    missing.push("No factual claims were extracted from the draft.");
  }

  return Array.from(new Set(missing)).slice(0, 24);
}

function buildPublishRisks(
  claims: BlogAuditClaim[],
  brandFindings: BlogAuditBrandFinding[],
  sources: VastSourceResult[],
  externalEvidence: ExternalEvidenceState
) {
  const risks = [];

  if (claims.some((claim) => claim.status === "FAIL")) {
    risks.push("At least one factual claim uses language that should not be published as written.");
  }

  if (claims.some((claim) => claim.status === "UNSUPPORTED")) {
    risks.push("Some claims were checked against Vast and external sources but still need support.");
  }

  if (claims.some((claim) => claim.status === "BLOCKED")) {
    risks.push("Some claims could not complete external evidence review.");
  }

  if (externalEvidence.status === "UNAVAILABLE" || externalEvidence.status === "FAILED") {
    risks.push(externalEvidence.message);
  }

  if (claims.some((claim) => claim.status === "STALE_RISK")) {
    risks.push("Pricing, GPU availability, or current-state claims may become stale after this audit.");
  }

  if (sources.some((source) => source.required && source.status !== "ok")) {
    risks.push("A required Vast truth source was unavailable during the audit.");
  }

  if (sources.some((source) => source.id === "linkedin-approved-feed" && source.status !== "ok")) {
    risks.push("LinkedIn messaging was not checked because no approved feed was configured.");
  }

  if (brandFindings.some((finding) => finding.severity === "high")) {
    risks.push("High-severity brand or overpromise language needs human review.");
  }

  risks.push("Human approval is required before publishing; this endpoint audits only.");

  return Array.from(new Set(risks));
}

function scoreTruth(claims: BlogAuditClaim[], sources: VastSourceResult[]) {
  if (!claims.length) {
    return 0;
  }

  const values: Record<BlogAuditClaimStatus, number> = {
    PASS: 100,
    STALE_RISK: 68,
    UNSUPPORTED: 35,
    BLOCKED: 25,
    FAIL: 0,
  };
  const average = claims.reduce((sum, claim) => sum + values[claim.status], 0) / claims.length;
  const sourcePenalty = sources.filter((source) => source.required && source.status !== "ok").length * 8;
  return clampScore(Math.round(average - sourcePenalty));
}

function scoreBrand(findings: BlogAuditBrandFinding[]) {
  const penalty = findings.reduce((sum, finding) => {
    if (finding.severity === "high") return sum + 26;
    if (finding.severity === "medium") return sum + 14;
    return sum + 7;
  }, 0);

  return clampScore(100 - penalty);
}

function recommendPublication(
  truthScore: number,
  brandScore: number,
  claims: BlogAuditClaim[],
  brandFindings: BlogAuditBrandFinding[],
  sources: VastSourceResult[]
): BlogAuditRecommendation {
  if (
    truthScore < 55 ||
    brandScore < 65 ||
    claims.some((claim) => claim.status === "FAIL") ||
    brandFindings.filter((finding) => finding.severity === "high").length >= 2 ||
    sources.some((source) => source.required && source.status !== "ok")
  ) {
    return "DO_NOT_PUBLISH";
  }

  if (
    truthScore < 88 ||
    brandScore < 90 ||
    claims.some((claim) => claim.status === "UNSUPPORTED" || claim.status === "STALE_RISK" || claim.status === "BLOCKED") ||
    brandFindings.length
  ) {
    return "PASS_WITH_EDITS";
  }

  return "PASS";
}

function summarizeAudit(
  recommendation: BlogAuditRecommendation,
  truthScore: number,
  brandScore: number,
  claims: BlogAuditClaim[],
  brandFindings: BlogAuditBrandFinding[]
) {
  const blocked = claims.filter((claim) => claim.status === "BLOCKED").length;
  const unsupported = claims.filter((claim) => claim.status === "UNSUPPORTED").length;
  const stale = claims.filter((claim) => claim.status === "STALE_RISK").length;
  const failed = claims.filter((claim) => claim.status === "FAIL").length;

  if (recommendation === "PASS") {
    return `The draft is publishable after human approval. Truth score ${truthScore}, brand score ${brandScore}.`;
  }

  if (recommendation === "DO_NOT_PUBLISH") {
    return `Do not publish yet. ${failed} failed, ${unsupported} unsupported, ${blocked} blocked, and ${stale} stale-risk claims were found; brand findings: ${brandFindings.length}.`;
  }

  return `Publish only after edits. Truth score ${truthScore}, brand score ${brandScore}; review ${unsupported + blocked + stale + failed} claim issues and ${brandFindings.length} brand findings.`;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForSearch(value: string) {
  return value.toLowerCase().replace(/vast\.ai/g, "vastai").replace(/[^a-z0-9.$/ -]+/g, " ").replace(/\s+/g, " ");
}

function compactClaimPhrase(claim: string) {
  return normalizeForSearch(claim)
    .split(" ")
    .filter((token) => token.length > 2)
    .slice(0, 12)
    .join(" ");
}

function importantTokens(value: string) {
  return Array.from(
    new Set(
      normalizeForSearch(value)
        .split(/\s+/)
        .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    )
  ).slice(0, 22);
}

function extractGpuModels(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .match(/\b(?:rtx\s*-?\s*\d{4}(?:\s*(?:ti|super|s|d))?|a100|h100|h200|b200|l40s|v100|a10g?)\b/g)
        ?.map((item) => item.replace(/\s+/g, " ").replace(/\s*-\s*/g, "-")) || []
    )
  );
}

function softenClaim(claim: string) {
  const normalizedClaim = normalizeVastProductName(claim);
  const models = extractGpuModels(normalizedClaim);

  if (models.length && /\b(price|pricing|cost|costs|cheap|cheaper|cheapest|available|availability|inventory|current|today|now|latest|uptime)\b/i.test(normalizedClaim)) {
    return `Vast.ai may offer ${formatModelList(models)} GPU options, but pricing and availability should be verified in live Vast inventory at publish time.`;
  }

  if (/\b100%\s*(uptime|availability|secure|compliant|reliable)\b|\buptime\b|\bguarantee[sd]?\b|\bnever\s+(fails|down|unavailable)\b|\bunlimited\b/i.test(normalizedClaim)) {
    return "Remove the guarantee unless a current Vast source directly supports the exact wording.";
  }

  return normalizedClaim
    .replace(/\bguarantee[sd]?\b/gi, "is designed to support")
    .replace(/\balways\b/gi, "often")
    .replace(/\bcheapest\b/gi, "cost-conscious")
    .replace(/\bfastest\b/gi, "high-performance")
    .replace(/\bbest\b/gi, "useful")
    .replace(/\b100%\b/g, "strong");
}

function addTimeSensitivity(claim: string) {
  const softened = softenClaim(claim);
  if (/publish time\.$/i.test(softened)) {
    return softened;
  }

  return `${softened} Verify live Vast pricing and GPU availability at publish time.`;
}

function normalizeVastProductName(value: string) {
  return value.replace(/\bVastAI\b|\bVast AI\b|\bvast ai\b/gi, "Vast.ai");
}

function formatModelList(models: string[]) {
  return models.map((model) => model.toUpperCase()).join(", ");
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function summarizePricingSource(rawJson: string) {
  try {
    const parsed = JSON.parse(rawJson) as { gpus?: Record<string, { min?: number; median?: number; count?: number; machineCount?: number }> };
    const rows = Object.entries(parsed.gpus || {})
      .slice(0, 220)
      .map(([gpu, data]) => {
        const min = typeof data.min === "number" ? `$${data.min.toFixed(3)}/hr minimum` : "";
        const median = typeof data.median === "number" ? `$${data.median.toFixed(3)}/hr median` : "";
        const count = typeof data.count === "number" ? `${data.count} offers` : "";
        const machines = typeof data.machineCount === "number" ? `${data.machineCount} machines` : "";
        return [gpu, min, median, count, machines].filter(Boolean).join(" ");
      });

    return normalizeWhitespace(`Vast live pricing inventory ${rows.join(". ")}`);
  } catch {
    return normalizeWhitespace(rawJson);
  }
}

async function fetchText(url: string, maxBytes: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5",
        "User-Agent": "CircleClick Vast Blog Audit/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      contentType: response.headers.get("content-type") || "",
      text: await readCappedResponse(response, maxBytes),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readCappedResponse(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) {
    return (await response.text()).slice(0, maxBytes);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const nextBytes = totalBytes + value.byteLength;
    if (nextBytes > maxBytes) {
      chunks.push(value.slice(0, Math.max(0, maxBytes - totalBytes)));
      await reader.cancel();
      break;
    }

    chunks.push(value);
    totalBytes = nextBytes;
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function assertPublicUrl(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL input must be a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL input must use http or https.");
  }

  const hostname = url.hostname.toLowerCase();
  if (isPrivateHostname(hostname)) {
    throw new Error("URL input cannot target private or local network hosts.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error("URL input cannot target private or local network hosts.");
    }
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.some((address) => isPrivateIp(address.address))) {
    throw new Error("URL input cannot resolve to private or local network hosts.");
  }
}

function isPrivateHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  );
}

function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}
