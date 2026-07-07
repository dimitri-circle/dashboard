import { lookup } from "node:dns/promises";
import net from "node:net";
import { load } from "cheerio";
import {
  normalizeToneProfile,
  toneProfileToContextText,
  toneProfileToRuleLines,
  type BlogToneProfile,
} from "./blog-tone-profile";

export type BlogAuditRecommendation = "PASS" | "PASS_WITH_EDITS" | "DO_NOT_PUBLISH";
export type BlogAuditClaimStatus = "PASS" | "FAIL" | "UNSUPPORTED" | "STALE_RISK" | "BLOCKED";
export type BlogAuditFormat = "markdown" | "plain_text" | "html" | "url";

export type BlogAuditInput = {
  title?: string;
  format?: string;
  content?: string;
  url?: string;
  clientName?: string;
  clientContext?: string;
  approvedSources?: string[];
  forbiddenClaims?: string[];
  toneRules?: string[];
  toneProfile?: BlogToneProfile | Record<string, unknown> | string | null;
};

export type BlogAuditClaimSourceType = "vast_source" | "client_context" | "external_web" | "missing_source" | "blocked";

export type BlogAuditClaim = {
  claim: string;
  status: BlogAuditClaimStatus;
  reason: string;
  evidence: string[];
  suggestedRewrite: string;
  sourceType: BlogAuditClaimSourceType;
};

export type BlogAuditBrandFinding = {
  issue: string;
  severity: "low" | "medium" | "high";
  suggestedRewrite: string;
};

export type BlogAuditClientFit = {
  status: "MATCH" | "UNCLEAR" | "MISMATCH";
  message: string;
  signals: string[];
};

export type BlogAuditHumanEditSignal = {
  label: string;
  severity: "low" | "medium" | "high";
  detail: string;
};

export type BlogAuditHumanEditCheck = {
  status: "READY" | "NEEDS_EDIT" | "HIGH_RISK";
  score: number;
  message: string;
  signals: BlogAuditHumanEditSignal[];
};

export type BlogAuditReport = {
  recommendation: BlogAuditRecommendation;
  truthScore: number;
  brandScore: number;
  clientFit: BlogAuditClientFit;
  humanEditCheck: BlogAuditHumanEditCheck;
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
const EXTERNAL_EVIDENCE_BATCH_SIZE = 8;
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
const GENERIC_AI_STYLE_PHRASES = [
  "in today's fast-paced",
  "ever-evolving",
  "game-changing",
  "revolutionary",
  "cutting-edge",
  "seamless",
  "unlock",
  "delve",
  "landscape",
  "robust",
  "leverage",
  "transformative",
  "at the forefront",
  "in the realm of",
  "pivotal",
  "redefine",
  "harness",
];

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
  const sources = appendClientContextSources(options.sources || (await fetchVastAuditSources()), normalizedInput);
  const baseClaimFindings = claims.map((claim) => auditClaim(claim, sources));
  const externalEvidence =
    options.externalEvidence
      ? buildExternalEvidenceState("CHECKED", "External evidence checked.", options.externalEvidence, options.externalEvidence.length)
      : await fetchExternalEvidenceForClaims(baseClaimFindings, sources);
  const claimFindings = applyExternalEvidence(baseClaimFindings, externalEvidence);
  const brandFindings = auditBrand(cleanText);
  const clientFit = auditClientFit(cleanText, normalizedInput);
  const clientFitBrandFindings = clientFitToBrandFindings(clientFit);
  const clientBrandFindings = auditClientRules(cleanText, normalizedInput);
  const preliminaryBrandFindings = [...brandFindings, ...clientFitBrandFindings, ...clientBrandFindings];
  const humanEditCheck = auditHumanEditReadiness(cleanText, normalizedInput, clientFit, claimFindings, preliminaryBrandFindings);
  const combinedBrandFindings = [...preliminaryBrandFindings, ...humanEditToBrandFindings(humanEditCheck)];
  const missingEvidence = buildMissingEvidence(claimFindings, sources, claims, externalEvidence);
  const publishRisks = buildPublishRisks(claimFindings, combinedBrandFindings, sources, externalEvidence, clientFit, humanEditCheck);
  const truthScore = scoreTruth(claimFindings, sources);
  const brandScore = scoreBrand(combinedBrandFindings, clientFit);
  const recommendation = recommendPublication(truthScore, brandScore, claimFindings, combinedBrandFindings, sources, clientFit);

  return {
    recommendation,
    truthScore,
    brandScore,
    clientFit,
    humanEditCheck,
    summary: summarizeAudit(recommendation, truthScore, brandScore, claimFindings, combinedBrandFindings, clientFit),
    claims: claimFindings,
    brandFindings: combinedBrandFindings,
    missingEvidence,
    publishRisks,
    externalEvidence: externalEvidenceSummary(externalEvidence),
  };
}

export function validateBlogAuditInput(input: BlogAuditInput): BlogAuditInput & {
  format: BlogAuditFormat;
  content: string;
  url: string;
  clientName: string;
  clientContext: string;
  approvedSources: string[];
  forbiddenClaims: string[];
  toneRules: string[];
  toneProfile: BlogToneProfile | null;
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

  return {
    ...input,
    format,
    content,
    url,
    clientName: sanitizeClientName(input.clientName),
    clientContext: sanitizeContextText(input.clientContext),
    approvedSources: normalizeStringList(input.approvedSources, 12, 240),
    forbiddenClaims: normalizeStringList(input.forbiddenClaims, 24, 220),
    toneRules: normalizeStringList(input.toneRules, 24, 220),
    toneProfile: normalizeToneProfile(input.toneProfile),
  };
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

function sanitizeContextText(value: unknown) {
  return typeof value === "string" ? normalizeWhitespace(value).slice(0, 6000) : "";
}

function normalizeStringList(value: unknown, limit: number, itemLimit: number) {
  const rows = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : [];

  return Array.from(
    new Set(
      rows
        .map((item) => normalizeWhitespace(String(item || "")).slice(0, itemLimit))
        .filter(Boolean)
    )
  ).slice(0, limit);
}

function appendClientContextSources(
  sources: VastSourceResult[],
  input: BlogAuditInput & {
    clientContext: string;
    approvedSources: string[];
    forbiddenClaims: string[];
    toneRules: string[];
    toneProfile: BlogToneProfile | null;
  }
) {
  const contextParts = [
    input.clientContext,
    input.forbiddenClaims.length ? `Forbidden claims: ${input.forbiddenClaims.join(". ")}` : "",
    input.toneRules.length ? `Tone rules: ${input.toneRules.join(". ")}` : "",
    toneProfileToContextText(input.toneProfile),
  ].filter(Boolean);

  if (!contextParts.length && !input.approvedSources.length) {
    return sources;
  }

  const fetchedAt = new Date().toISOString();
  const clientSources: VastSourceResult[] = [];

  if (contextParts.length) {
    clientSources.push({
      id: "client-editorial-context",
      name: "Client editorial context",
      url: "client-context://editorial-context",
      kind: "brand",
      required: false,
      status: "ok",
      fetchedAt,
      text: contextParts.join("\n"),
    });
  }

  if (input.approvedSources.length) {
    clientSources.push({
      id: "client-approved-sources",
      name: "Client approved source list",
      url: "client-context://approved-sources",
      kind: "brand",
      required: false,
      status: "ok",
      fetchedAt,
      text: input.approvedSources.join("\n"),
    });
  }

  return [...sources, ...clientSources];
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
  const sourceType = sourceTypeForEvidence(evidence);

  if (hardOverpromise) {
    return {
      claim,
      status: "FAIL",
      reason: "The claim uses absolute or guaranteed language that cannot be safely proven from current Vast sources.",
      evidence,
      suggestedRewrite: softenClaim(claim),
      sourceType,
    };
  }

  if (isTimeSensitive && !sources.some((source) => source.id === "pricing-api" && source.status === "ok")) {
    return {
      claim,
      status: "BLOCKED",
      reason: "The claim depends on live pricing, GPU availability, or current inventory, but the live pricing source was not available.",
      evidence,
      suggestedRewrite: "Verify the current Vast inventory and pricing page, then state the claim with an audit date.",
      sourceType: "blocked",
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
      sourceType,
    };
  }

  if (evidence.length) {
    return {
      claim,
      status: "PASS",
      reason: "The claim is observable in current Vast sources.",
      evidence,
      suggestedRewrite: "No rewrite required.",
      sourceType,
    };
  }

  if (sourceFailures.length === sources.filter((source) => source.required).length) {
    return {
      claim,
      status: "BLOCKED",
      reason: "Required Vast sources could not be fetched, so the claim cannot be verified.",
      evidence: [],
      suggestedRewrite: "Hold this claim until the current Vast sources can be checked.",
      sourceType: "blocked",
    };
  }

  return {
    claim,
    status: "UNSUPPORTED",
    reason: "The claim was not observed in the fetched Vast source set.",
    evidence: [],
    suggestedRewrite: softenClaim(claim),
    sourceType: "missing_source",
  };
}

function sourceTypeForEvidence(evidence: string[]): BlogAuditClaimSourceType {
  if (evidence.some((url) => url.startsWith("client-context://"))) {
    return "client_context";
  }

  if (evidence.length) {
    return "vast_source";
  }

  return "missing_source";
}

async function fetchExternalEvidenceForClaims(claims: BlogAuditClaim[], sources: VastSourceResult[]): Promise<ExternalEvidenceState> {
  const candidates = claims
    .filter((claim) => claim.status === "UNSUPPORTED")
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
    const results: ExternalEvidenceResult[] = [];
    let failedBatch = false;

    for (const batch of chunkCandidates(candidates, EXTERNAL_EVIDENCE_BATCH_SIZE)) {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildExternalEvidenceRequest(batch, sources)),
      });

      if (!response.ok) {
        failedBatch = true;
        continue;
      }

      const payload = await response.json();
      results.push(...normalizeExternalEvidenceResponse(payload, batch));
    }

    if (failedBatch) {
      return buildExternalEvidenceState(
        "FAILED",
        "External evidence unavailable: one or more OpenAI source retrieval batches failed.",
        results,
        candidates.length
      );
    }

    return buildExternalEvidenceState("CHECKED", "External evidence checked.", results, candidates.length);
  } catch {
    return buildExternalEvidenceState(
      "FAILED",
      "External evidence unavailable: OpenAI source retrieval failed.",
      [],
      candidates.length
    );
  }
}

function chunkCandidates<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
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
          sourceType: "missing_source",
        };
      }

      if (externalEvidence.status === "UNAVAILABLE" || externalEvidence.status === "FAILED") {
        return {
          ...claim,
          status: "BLOCKED",
          reason: externalEvidence.message,
          suggestedRewrite: "Hold this claim until external evidence can be checked.",
          sourceType: "blocked",
        };
      }

      return claim;
    }

    if (external.status === "UNSUPPORTED") {
      return {
        ...claim,
        reason: "External evidence checked: no reviewable source found.",
        sourceType: "missing_source",
      };
    }

    return {
      ...claim,
      status: external.status,
      reason: `External evidence check: ${external.reason}`,
      evidence: external.evidence,
      suggestedRewrite: external.suggestedRewrite || (external.status === "PASS" ? "No rewrite required." : softenClaim(claim.claim)),
      sourceType: "external_web",
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

const KNOWN_COMPANY_SIGNALS = [
  "Amazon Web Services",
  "Anthropic",
  "CoreWeave",
  "Cerebras",
  "DigitalOcean",
  "Google Cloud",
  "Hewlett Packard Enterprise",
  "Lambda Labs",
  "Linode",
  "Microsoft Azure",
  "NVIDIA",
  "OpenAI",
  "Oracle Cloud",
  "RunPod",
  "Together AI",
  "THORChain",
  "Vast.ai",
];

function auditClientFit(
  text: string,
  input: BlogAuditInput & {
    clientName: string;
    clientContext: string;
    toneProfile: BlogToneProfile | null;
  }
): BlogAuditClientFit {
  const clientName = input.clientName.trim();

  if (!clientName) {
    return {
      status: "UNCLEAR",
      message: "No active client name was supplied, so Br(AI)N could not verify whether the draft is framed for the selected client.",
      signals: ["Missing selected client name"],
    };
  }

  const normalizedText = normalizeForSearch(text);
  const openingText = normalizeForSearch(text.slice(0, 2200));
  const aliases = clientNameAliases(clientName);
  const clientMentions = countAliasMentions(normalizedText, aliases);
  const clientOpeningMentions = countAliasMentions(openingText, aliases);
  const otherCompanies = extractCompanySignals(text, aliases);
  const dominantCompany = otherCompanies[0];

  const signals = [
    `${clientName} mentions: ${clientMentions}`,
    `${clientName} opening mentions: ${clientOpeningMentions}`,
    ...(dominantCompany ? [`Dominant other company: ${dominantCompany.name} (${dominantCompany.count})`] : []),
  ];

  if (
    dominantCompany &&
    dominantCompany.count >= 3 &&
    dominantCompany.openingCount >= 1 &&
    (clientMentions === 0 || dominantCompany.count >= clientMentions + 3)
  ) {
    return {
      status: "MISMATCH",
      message: `The draft appears centered on ${dominantCompany.name}, not ${clientName}. It may be valid research, but it is not framed as a ${clientName} content draft yet.`,
      signals,
    };
  }

  if (clientMentions === 0) {
    return {
      status: "UNCLEAR",
      message: `Br(AI)N could not find clear ${clientName} framing in the draft. Add client-specific positioning before treating this as ready for editorial review.`,
      signals,
    };
  }

  if (clientOpeningMentions === 0 && text.length > 700) {
    return {
      status: "UNCLEAR",
      message: `${clientName} appears in the draft, but not in the opening frame. The reader may not understand why this is a ${clientName} piece.`,
      signals,
    };
  }

  return {
    status: "MATCH",
    message: `The draft includes visible ${clientName} framing and can be reviewed against the saved client context and tone rules.`,
    signals,
  };
}

function clientFitToBrandFindings(clientFit: BlogAuditClientFit): BlogAuditBrandFinding[] {
  if (isMissingClientFit(clientFit)) {
    return [];
  }

  if (clientFit.status === "MISMATCH") {
    return [
      {
        issue: `Client framing mismatch. ${clientFit.message}`,
        severity: "high",
        suggestedRewrite: "Reframe the draft around the selected client before editing line-level claims.",
      },
    ];
  }

  if (clientFit.status === "UNCLEAR") {
    return [
      {
        issue: `Client framing needs review. ${clientFit.message}`,
        severity: "medium",
        suggestedRewrite: "Add client-specific positioning, audience context, or approved source support near the top of the draft.",
      },
    ];
  }

  return [];
}

function auditHumanEditReadiness(
  text: string,
  input: BlogAuditInput & { clientName: string; toneProfile: BlogToneProfile | null },
  clientFit: BlogAuditClientFit,
  claims: BlogAuditClaim[],
  brandFindings: BlogAuditBrandFinding[]
): BlogAuditHumanEditCheck {
  const signals: BlogAuditHumanEditSignal[] = [];
  const normalizedText = normalizeForSearch(text);
  const sentences = splitSentencesForEditCheck(text);
  const sentenceWordCounts = sentences.map((sentence) => countWords(sentence)).filter((count) => count > 0);
  const totalWords = sentenceWordCounts.reduce((sum, count) => sum + count, 0);
  const averageSentenceWords = sentenceWordCounts.length ? totalWords / sentenceWordCounts.length : 0;
  const longestSentenceWords = sentenceWordCounts.length ? Math.max(...sentenceWordCounts) : 0;
  const longSentenceCount = sentenceWordCounts.filter((count) => count >= 42).length;
  const genericPhraseHits = GENERIC_AI_STYLE_PHRASES.reduce((hits, phrase) => {
    const normalizedPhrase = normalizeForSearch(phrase);
    return hits + (normalizedText.match(new RegExp(`\\b${escapeRegExp(normalizedPhrase)}\\b`, "g")) || []).length;
  }, 0);
  const claimIssues = claims.filter((claim) => claim.status !== "PASS").length;
  const claimIssueRatio = claims.length ? claimIssues / claims.length : 0;
  const repeatedStarts = repeatedSentenceStarts(sentences);
  const concreteAnchorCount = (text.match(/https?:\/\/|\$|\b\d+(?:[.,]\d+)?%?\b|\b(?:gpu|gpus|nvidia|api|pricing|instance|instances|docker|ssh|model|models|platform)\b/gi) || []).length;
  const highBrandFindings = brandFindings.filter((finding) => finding.severity === "high").length;
  const profileAverage = input.toneProfile?.signals.averageSentenceWords || 0;

  function addSignal(label: string, severity: BlogAuditHumanEditSignal["severity"], detail: string) {
    if (signals.some((signal) => signal.label === label && signal.detail === detail)) {
      return;
    }
    signals.push({ label, severity, detail });
  }

  if (clientFit.status === "MISMATCH") {
    addSignal("Client framing risk", "high", clientFit.message);
  } else if (clientFit.status === "UNCLEAR" && !isMissingClientFit(clientFit)) {
    addSignal("Client framing needs edit", "medium", clientFit.message);
  }

  if (genericPhraseHits >= 7) {
    addSignal(
      "Generic marketing language",
      "high",
      `${genericPhraseHits} broad phrases were found. Replace them with client-specific facts, proof, or examples.`
    );
  } else if (genericPhraseHits >= 4) {
    addSignal(
      "Generic marketing language",
      "medium",
      `${genericPhraseHits} broad phrases were found. Replace them with client-specific facts, proof, or examples.`
    );
  } else if (genericPhraseHits >= 2) {
    addSignal(
      "Generic language needs review",
      "low",
      `${genericPhraseHits} broad phrase${genericPhraseHits === 1 ? "" : "s"} may need a more specific rewrite.`
    );
  }

  if (repeatedStarts.length) {
    addSignal(
      "Repeated sentence pattern",
      repeatedStarts[0].count >= 4 ? "medium" : "low",
      `Several sentences begin with "${repeatedStarts[0].start}". Vary the structure during human edit.`
    );
  }

  if (longSentenceCount >= 2 || longestSentenceWords >= 58) {
    addSignal(
      "Dense sentence structure",
      longestSentenceWords >= 58 ? "medium" : "low",
      `${longSentenceCount} sentence${longSentenceCount === 1 ? "" : "s"} exceed 42 words; the longest is ${longestSentenceWords} words.`
    );
  }

  if (sentenceWordCounts.length >= 8 && sentenceLengthDeviation(sentenceWordCounts) <= 3.2 && averageSentenceWords >= 12) {
    addSignal(
      "Uniform rhythm",
      "low",
      "Sentence lengths are unusually even. Add human variation where the draft sounds patterned."
    );
  }

  if (claims.length >= 5 && claimIssueRatio >= 0.45) {
    addSignal(
      "Evidence density risk",
      "high",
      `${claimIssues} of ${claims.length} claims need proof, blocking, or freshness review.`
    );
  } else if (claims.length >= 5 && claimIssueRatio >= 0.25) {
    addSignal(
      "Evidence density needs edit",
      "medium",
      `${claimIssues} of ${claims.length} claims need proof, blocking, or freshness review.`
    );
  }

  if (totalWords >= 360 && concreteAnchorCount < 3) {
    addSignal(
      "Low concrete detail",
      "medium",
      "The draft has few numbers, URLs, product terms, or technical anchors for its length."
    );
  }

  if (highBrandFindings >= 2) {
    addSignal(
      "High-severity editorial risk",
      "high",
      `${highBrandFindings} high-severity brand or overpromise findings need editor review.`
    );
  }

  if (profileAverage && sentenceWordCounts.length >= 5 && Math.abs(averageSentenceWords - profileAverage) >= 12) {
    addSignal(
      "Tone profile distance",
      "medium",
      `Average sentence length is ${Math.round(averageSentenceWords)} words versus ${Math.round(profileAverage)} in the saved client tone profile.`
    );
  }

  const penalty = signals.reduce((sum, signal) => {
    if (signal.severity === "high") return sum + 24;
    if (signal.severity === "medium") return sum + 14;
    return sum + 7;
  }, 0);
  const score = clampScore(100 - penalty);
  const status: BlogAuditHumanEditCheck["status"] =
    clientFit.status === "MISMATCH" || score <= 60 ? "HIGH_RISK" : score <= 82 ? "NEEDS_EDIT" : "READY";
  const message =
    status === "HIGH_RISK"
      ? "Needs a human rewrite before editorial review."
      : status === "NEEDS_EDIT"
        ? "Needs a human pass for specificity, voice, or proof."
        : "No major AI-likeness or generic-edit signals were found.";

  return {
    status,
    score,
    message,
    signals: signals.slice(0, 8),
  };
}

function humanEditToBrandFindings(check: BlogAuditHumanEditCheck): BlogAuditBrandFinding[] {
  if (check.status !== "HIGH_RISK") {
    return [];
  }

  return [
    {
      issue: `Human edit risk. ${check.message}`,
      severity: "medium",
      suggestedRewrite: "Treat this as an editorial signal, not a definitive AI detector; rewrite the draft with client-specific proof and human review.",
    },
  ];
}

function splitSentencesForEditCheck(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => importantTokens(sentence).length >= 4)
    .slice(0, 80);
}

function countWords(value: string) {
  return value.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu)?.length || 0;
}

function repeatedSentenceStarts(sentences: string[]) {
  const counts = new Map<string, number>();

  for (const sentence of sentences) {
    const start = importantTokens(sentence).slice(0, 3).join(" ");
    if (start.split(" ").length < 2) {
      continue;
    }
    counts.set(start, (counts.get(start) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([start, count]) => ({ start, count }))
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count || a.start.localeCompare(b.start));
}

function sentenceLengthDeviation(counts: number[]) {
  if (!counts.length) {
    return 0;
  }

  const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
  const variance = counts.reduce((sum, count) => sum + (count - average) ** 2, 0) / counts.length;
  return Math.sqrt(variance);
}

function isMissingClientFit(clientFit: BlogAuditClientFit) {
  return clientFit.status === "UNCLEAR" && clientFit.signals.includes("Missing selected client name");
}

function clientNameAliases(clientName: string) {
  const normalized = normalizeForSearch(clientName);
  const compact = normalized.replace(/\s+/g, "");
  const aliases = new Set([normalized, compact]);

  if (/\bvast\b|\bvastai\b/i.test(normalized) || compact === "vastai") {
    aliases.add("vast");
    aliases.add("vastai");
    aliases.add("vast ai");
  }

  normalized
    .split(/\s+/)
    .filter((part) => part.length >= 4)
    .forEach((part) => aliases.add(part));

  return Array.from(aliases).filter(Boolean);
}

function countAliasMentions(normalizedText: string, aliases: string[]) {
  return aliases.reduce((sum, alias) => {
    const normalizedAlias = normalizeForSearch(alias);
    if (!normalizedAlias) return sum;
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedAlias)}(?=\\s|$)`, "g");
    return sum + (normalizedText.match(pattern) || []).length;
  }, 0);
}

function extractCompanySignals(text: string, clientAliases: string[]) {
  const normalizedText = normalizeForSearch(text);
  const openingText = normalizeForSearch(text.slice(0, 2200));

  return KNOWN_COMPANY_SIGNALS.map((name) => {
    const aliases = clientNameAliases(name);
    if (aliases.some((alias) => clientAliases.includes(alias))) {
      return null;
    }

    const count = countAliasMentions(normalizedText, aliases);
    const openingCount = countAliasMentions(openingText, aliases);
    return count ? { name, count, openingCount } : null;
  })
    .filter((item): item is { name: string; count: number; openingCount: number } => Boolean(item))
    .sort((a, b) => b.count - a.count || b.openingCount - a.openingCount || a.name.localeCompare(b.name));
}

function auditClientRules(
  text: string,
  input: BlogAuditInput & {
    clientName: string;
    forbiddenClaims: string[];
    toneRules: string[];
    toneProfile: BlogToneProfile | null;
  }
) {
  const findings: BlogAuditBrandFinding[] = [];
  const normalizedText = normalizeForSearch(text);
  const profileRules = toneProfileToRuleLines(input.toneProfile);
  const combinedToneRules = [...input.toneRules, ...profileRules];

  for (const forbidden of input.forbiddenClaims) {
    const normalizedForbidden = normalizeForSearch(forbidden);
    if (normalizedForbidden && normalizedText.includes(normalizedForbidden)) {
      findings.push({
        issue: `Client-specific forbidden claim appears: "${forbidden}".`,
        severity: "high",
        suggestedRewrite: "Remove or rewrite this claim before sending the draft forward.",
      });
    }
  }

  if (combinedToneRules.length && /\b(revolutionary|game[- ]changing|insane|magic)\b/i.test(text)) {
    findings.push({
      issue: "Draft contains hype language that may conflict with client tone rules.",
      severity: "medium",
      suggestedRewrite: `Align the draft with: ${combinedToneRules.slice(0, 2).join("; ")}.`,
    });
  }

  const longSentence = longestSentenceWordCount(text);
  if (input.toneProfile?.signals.averageSentenceWords && input.toneProfile.signals.averageSentenceWords <= 18 && longSentence >= 38) {
    findings.push({
      issue: `Draft has a ${longSentence}-word sentence, but the approved tone profile is concise.`,
      severity: "low",
      suggestedRewrite: "Split the sentence into shorter steps so it matches the approved rhythm.",
    });
  }

  if (
    input.toneProfile?.vocabulary.length &&
    !input.toneProfile.vocabulary.some((term) => normalizedText.includes(normalizeForSearch(term))) &&
    text.length > 700
  ) {
    findings.push({
      issue: "Draft does not use the recurring vocabulary from the approved tone profile.",
      severity: "low",
      suggestedRewrite: `Check whether terms like ${input.toneProfile.vocabulary.slice(0, 3).join(", ")} belong in this draft.`,
    });
  }

  return findings.slice(0, 12);
}

function longestSentenceWordCount(text: string) {
  return text
    .replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1\n")
    .split(/\n+/)
    .map((sentence) => (sentence.match(/\b[\w'-]+\b/g) || []).length)
    .reduce((max, count) => Math.max(max, count), 0);
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
  externalEvidence: ExternalEvidenceState,
  clientFit: BlogAuditClientFit,
  humanEditCheck: BlogAuditHumanEditCheck
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

  if (clientFit.status === "MISMATCH") {
    risks.push(`Client framing mismatch: ${clientFit.message}`);
  }

  if (clientFit.status === "UNCLEAR" && !isMissingClientFit(clientFit)) {
    risks.push(`Client framing needs review: ${clientFit.message}`);
  }

  if (humanEditCheck.status === "HIGH_RISK") {
    risks.push(`Human edit risk: ${humanEditCheck.message}`);
  } else if (humanEditCheck.status === "NEEDS_EDIT") {
    risks.push(`Human edit recommended: ${humanEditCheck.message}`);
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

function scoreBrand(findings: BlogAuditBrandFinding[], clientFit: BlogAuditClientFit) {
  const penalty = findings.reduce((sum, finding) => {
    if (finding.severity === "high") return sum + 26;
    if (finding.severity === "medium") return sum + 14;
    return sum + 7;
  }, 0);

  const baseScore = clampScore(100 - penalty);

  if (clientFit.status === "MISMATCH") {
    return Math.min(baseScore, 54);
  }

  if (clientFit.status === "UNCLEAR" && !isMissingClientFit(clientFit)) {
    return Math.min(baseScore, 78);
  }

  return baseScore;
}

function recommendPublication(
  truthScore: number,
  brandScore: number,
  claims: BlogAuditClaim[],
  brandFindings: BlogAuditBrandFinding[],
  sources: VastSourceResult[],
  clientFit: BlogAuditClientFit
): BlogAuditRecommendation {
  if (
    clientFit.status === "MISMATCH" ||
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
    (clientFit.status === "UNCLEAR" && !isMissingClientFit(clientFit)) ||
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
  brandFindings: BlogAuditBrandFinding[],
  clientFit: BlogAuditClientFit
) {
  const blocked = claims.filter((claim) => claim.status === "BLOCKED").length;
  const unsupported = claims.filter((claim) => claim.status === "UNSUPPORTED").length;
  const stale = claims.filter((claim) => claim.status === "STALE_RISK").length;
  const failed = claims.filter((claim) => claim.status === "FAIL").length;

  if (clientFit.status === "MISMATCH") {
    return `Do not publish yet. ${clientFit.message} Truth score ${truthScore}, brand score ${brandScore}; review ${unsupported + blocked + stale + failed} claim issues and ${brandFindings.length} brand findings.`;
  }

  if (clientFit.status === "UNCLEAR" && !isMissingClientFit(clientFit)) {
    return `Publish only after edits. ${clientFit.message} Truth score ${truthScore}, brand score ${brandScore}; review ${unsupported + blocked + stale + failed} claim issues and ${brandFindings.length} brand findings.`;
  }

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

function sanitizeClientName(value: unknown) {
  return typeof value === "string" ? normalizeWhitespace(value).slice(0, 120) : "";
}

function normalizeForSearch(value: string) {
  return value.toLowerCase().replace(/vast\.ai/g, "vastai").replace(/[^a-z0-9.$/ -]+/g, " ").replace(/\s+/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
