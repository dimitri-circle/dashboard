import crypto, { randomUUID } from "node:crypto";
import { load } from "cheerio";
import { decryptSecret, encryptSecret } from "./crypto";
import { ensureSeoStorage, getSeoCollections } from "./db";
import {
  normalizeSeoChangeTrackerSite,
  runSeoChangeTracker,
  type SeoChangeTrackerBaseline,
  type SeoChangeTrackerInput,
  type SeoChangeTrackerResult,
} from "./seo-change-tracker";
import { notifySeoWatchSlack } from "./slack";
import type {
  SeoClient,
  SeoChangeRun,
  SeoCompetitiveAnalysis,
  SeoCompetitiveCrawlPage,
  SeoCompetitiveCrawlSite,
  SeoCompetitiveFeatureEvidence,
  SeoCompetitivePattern,
  SafeSeoIntegration,
  SeoInsight,
  SeoIntegration,
  SeoMetricSnapshot,
  SeoPriority,
  SeoProvider,
  SeoWatchBaseline,
} from "./types";
import { DEFAULT_CLIENT_ID, normalizeClientId, type SeoTenantScope } from "./tenant";

const PROVIDERS = new Set<SeoProvider>(["ga4", "gtm", "hotjar", "openai", "mcp", "gsc", "semrush", "ahrefs"]);
const SECRET_FIELDS = new Set(["apiKey", "token", "bearerToken", "clientSecret", "refreshToken", "accessToken"]);
const NORMALIZED_SECRET_FIELDS = new Set([
  "apikey",
  "token",
  "bearertoken",
  "clientsecret",
  "refreshtoken",
  "accesstoken",
  "serviceaccountjson",
  "privatekey",
  "secret",
  "password",
  "credential",
  "credentials",
]);
const HTTP_TIMEOUT_MS = 7000;
const MAX_AI_INPUT_STRING_LENGTH = 1200;
const CRAWL_TIMEOUT_MS = 6000;
const MAX_CRAWL_BYTES = 650_000;
const MAX_CRAWL_PAGES_PER_SITE = 6;
const MAX_COMPETITOR_SITES = 8;
const SEO_CHANGE_RUN_LIMIT = 8;

type IntegrationPayload = {
  integrationId?: string;
  provider?: string;
  display_name?: string;
  config?: Record<string, unknown>;
};

type SecretMap = Record<string, string>;

type Ga4ServiceAccount = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type ClientPayload = {
  id?: string;
  name?: string;
  notes?: string;
};

type CompetitiveAnalysisPayload = {
  clientName?: string;
  websiteUrl?: string;
  industry?: string;
  market?: string;
  targetAudience?: string;
  competitors?: string;
  targetKeywords?: string;
  notes?: string;
  contextAssumptions?: string[];
};

type AuditPayload = {
  scope: SeoTenantScope;
  action: string;
  entityType: "client" | "integration" | "insight" | "sync" | "system";
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

const insightResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "seo_insight_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        insights: {
          type: "array",
          minItems: 1,
          maxItems: 7,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              impact: { type: "string" },
              recommendation: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
              confidence_score: { type: "integer", minimum: 0, maximum: 100 },
              source_provider: { type: "string", enum: ["ga4", "gtm", "hotjar", "mcp", "mixed"] },
            },
            required: ["title", "description", "impact", "recommendation", "priority", "confidence_score", "source_provider"],
          },
        },
      },
      required: ["insights"],
    },
  },
};

const competitiveAnalysisResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "seo_competitive_analysis_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        positioning: { type: "string" },
        competitor_themes: { type: "array", items: { type: "string" } },
        content_gaps: { type: "array", items: { type: "string" } },
        keyword_opportunities: { type: "array", items: { type: "string" } },
        report_draft: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              heading: { type: "string" },
              body: { type: "string" },
              source_urls: { type: "array", items: { type: "string" } },
            },
            required: ["heading", "body", "source_urls"],
          },
        },
        recommendations: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              rationale: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["title", "rationale", "priority"],
          },
        },
        assumptions: { type: "array", items: { type: "string" } },
        confidence_score: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: [
        "summary",
        "positioning",
        "competitor_themes",
        "content_gaps",
        "keyword_opportunities",
        "report_draft",
        "recommendations",
        "assumptions",
        "confidence_score",
      ],
    },
  },
};

const competitiveBriefAutofillResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "seo_competitive_brief_autofill_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        websiteUrl: { type: "string" },
        industry: { type: "string" },
        market: { type: "string" },
        targetAudience: { type: "string" },
        competitors: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              url: { type: "string" },
            },
            required: ["name", "url"],
          },
        },
        targetKeywords: { type: "array", maxItems: 8, items: { type: "string" } },
        notes: { type: "string" },
        assumptions: { type: "array", maxItems: 8, items: { type: "string" } },
      },
      required: [
        "websiteUrl",
        "industry",
        "market",
        "targetAudience",
        "competitors",
        "targetKeywords",
        "notes",
        "assumptions",
      ],
    },
  },
};

const WEBSITE_FEATURES: Array<{
  id: string;
  label: string;
  patterns: RegExp[];
  pageCategories?: string[];
}> = [
  { id: "pricing_page", label: "Pricing page", patterns: [/\bpricing\b|\bplans?\b|\bpackages?\b/], pageCategories: ["pricing"] },
  {
    id: "case_studies",
    label: "Case studies or customer stories",
    patterns: [/\bcase stud(y|ies)\b|\bcustomer stor(y|ies)\b|\bsuccess stor(y|ies)\b/],
    pageCategories: ["case_study"],
  },
  { id: "testimonials", label: "Testimonials or reviews", patterns: [/\btestimonial(s)?\b|\breviews?\b|\bwhat customers say\b/] },
  { id: "comparison_pages", label: "Comparison pages", patterns: [/\bcompare\b|\bversus\b|\bvs\.?\b|\balternative(s)?\b/], pageCategories: ["comparison"] },
  { id: "faq", label: "FAQ content", patterns: [/\bfaq\b|\bfrequently asked\b|\bquestions\b/], pageCategories: ["faq"] },
  { id: "lead_magnet", label: "Lead magnet", patterns: [/\bguide\b|\bwhite ?paper\b|\bebook\b|\bchecklist\b|\bdownload\b/] },
  { id: "demo_cta", label: "Demo or booking CTA", patterns: [/\bbook (a )?(demo|call)\b|\bschedule\b|\brequest a demo\b|\bget a demo\b/] },
  { id: "calculator", label: "Calculator or estimator", patterns: [/\bcalculator\b|\bestimator\b|\broi\b|\bassessment\b/] },
  { id: "service_pages", label: "Service pages", patterns: [/\bservices?\b|\bsolutions?\b|\bofferings?\b/], pageCategories: ["services"] },
  { id: "industry_pages", label: "Industry pages", patterns: [/\bindustr(y|ies)\b|\bfor [a-z ]+\b/], pageCategories: ["industry"] },
  { id: "location_pages", label: "Location pages", patterns: [/\blocations?\b|\bnear me\b|\bserving\b|\bservice area\b/], pageCategories: ["location"] },
  { id: "blog_resources", label: "Blog or resource hub", patterns: [/\bblog\b|\bresources?\b|\binsights?\b|\blearn\b/], pageCategories: ["blog"] },
  { id: "trust_badges", label: "Trust badges or proof", patterns: [/\bcertified\b|\btrusted\b|\bsecure\b|\bcompliant\b|\bsoc 2\b|\bhipaa\b|\baward(s)?\b/] },
  { id: "structured_schema", label: "Structured data schema", patterns: [/\bschema\b|\bstructured data\b/] },
  { id: "newsletter", label: "Newsletter signup", patterns: [/\bnewsletter\b|\bsubscribe\b|\bupdates\b/] },
  { id: "contact_page", label: "Contact page", patterns: [/\bcontact\b|\btalk to\b|\bget in touch\b/], pageCategories: ["contact"] },
];

const KEY_PAGE_PATTERNS = [
  /\bpricing\b|\bplans?\b|\bpackages?\b/,
  /\bservices?\b|\bsolutions?\b|\bfeatures?\b/,
  /\bcase-stud(y|ies)\b|\bcase stud(y|ies)\b|\bcustomers?\b/,
  /\bblog\b|\bresources?\b|\binsights?\b/,
  /\babout\b|\bcompany\b/,
  /\bfaq\b|\bquestions\b/,
  /\bcontact\b|\bdemo\b|\bbook\b|\bschedule\b/,
  /\bcompare\b|\bvs\b|\balternatives?\b/,
];

export function nowIso() {
  return new Date().toISOString();
}

export async function bootstrapSeoStorage() {
  await ensureSeoStorage();
  await listClients();
  return { ok: true };
}

export function safeIntegration(integration: SeoIntegration): SafeSeoIntegration {
  const { _id: _mongoId, encrypted_secret: encryptedSecret, ...safe } = integration;
  return {
    ...safe,
    config_json: redactForStorage(safe.config_json) as Record<string, unknown>,
    has_secret: Boolean(encryptedSecret),
  };
}

function slugifyClientId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return normalizeClientId(slug || DEFAULT_CLIENT_ID);
}

async function assignClientId(clients: Awaited<ReturnType<typeof getSeoCollections>>["clients"], name: string, requestedId: string) {
  if (requestedId) {
    const id = normalizeClientId(requestedId);
    if (await clients.findOne({ id })) {
      throw new Error("A client with this id already exists.");
    }
    return id;
  }

  const baseId = slugifyClientId(name);
  let id = baseId;

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    if (!(await clients.findOne({ id }))) {
      return id;
    }

    const suffix = `-${attempt + 1}`;
    id = normalizeClientId(`${baseId.slice(0, 64 - suffix.length)}${suffix}`);
  }

  throw new Error("Unable to assign a unique client id.");
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConfigKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSecretField(key: string) {
  return SECRET_FIELDS.has(key) || NORMALIZED_SECRET_FIELDS.has(normalizeConfigKey(key));
}

function hasSecretValue(config: Record<string, unknown>) {
  return Object.entries(config).some(([key, value]) => isSecretField(key) && Boolean(asString(value)));
}

function redactForStorage(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactForStorage);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        isSecretField(key) ? "[redacted]" : redactForStorage(nestedValue),
      ])
    );
  }

  return value;
}

function sanitizeForAiPayload(value: unknown): unknown {
  if (typeof value === "string") {
    return value.slice(0, MAX_AI_INPUT_STRING_LENGTH);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(sanitizeForAiPayload);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 80)
        .map(([key, nestedValue]) => [
          key,
          isSecretField(key) ? "[redacted]" : sanitizeForAiPayload(nestedValue),
        ])
    );
  }

  return null;
}

function stripSecrets(inputConfig: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {};
  const secrets: SecretMap = {};

  for (const [key, value] of Object.entries(inputConfig)) {
    if (isSecretField(key)) {
      const secret = asString(value);
      if (secret) {
        secrets[key] = secret;
      }
    } else {
      config[key] = value;
    }
  }

  return { config, secrets };
}

export function validateHttpUrl(rawUrl: unknown, fieldName = "baseUrl") {
  const value = asString(rawUrl);

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${fieldName} must use http or https.`);
    }
    return url;
  } catch (error) {
    if (error instanceof Error && error.message.includes("http")) {
      throw error;
    }
    throw new Error(`${fieldName} must be a valid URL.`);
  }
}

function validateIntegrationPayload(payload: IntegrationPayload) {
  const provider = asString(payload.provider).toLowerCase() as SeoProvider;
  if (!PROVIDERS.has(provider)) {
    throw new Error("Unsupported SEO integration provider.");
  }

  const config = payload.config && typeof payload.config === "object" ? payload.config : {};

  if (provider === "ga4" && !asString(config.propertyId)) {
    throw new Error("GA4 propertyId is required.");
  }

  if (provider === "gtm" && (!asString(config.accountId) || !asString(config.containerId))) {
    throw new Error("GTM accountId and containerId are required.");
  }

  if (provider === "hotjar" && !asString(config.siteId) && !asString(config.baseUrl)) {
    throw new Error("Hotjar siteId or connector baseUrl is required.");
  }

  if (provider === "openai" && !hasSecretValue(config) && !payload.integrationId) {
    throw new Error("OpenAI apiKey is required.");
  }

  if (provider === "mcp") {
    if (!asString(config.name) && !asString(payload.display_name)) {
      throw new Error("MCP connector name is required.");
    }
    validateHttpUrl(config.baseUrl);
    const authType = asString(config.authType) || "none";
    if (!["none", "bearer", "oauth"].includes(authType)) {
      throw new Error("MCP authType must be none, bearer, or oauth.");
    }
  }

  return { provider, config };
}

async function fetchJson(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body: unknown = null;

    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { text: text.slice(0, 300) };
      }
    }

    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function base64UrlEncode(value: string | Buffer) {
  const input = typeof value === "string" ? Buffer.from(value) : value;
  return input.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function normalizeGa4PropertyId(rawPropertyId: unknown) {
  const value = asString(rawPropertyId).replace(/^properties\//, "");

  if (!/^\d+$/.test(value)) {
    throw new Error("GA4 propertyId must be a numeric property id or properties/{id}.");
  }

  return value;
}

async function getGoogleServiceAccountAccessToken(serviceAccountJson: string) {
  let serviceAccount: Ga4ServiceAccount;

  try {
    serviceAccount = JSON.parse(serviceAccountJson) as Ga4ServiceAccount;
  } catch {
    throw new Error("GA4 service account JSON could not be parsed.");
  }

  const clientEmail = asString(serviceAccount.client_email);
  const privateKey = asString(serviceAccount.private_key).replace(/\\n/g, "\n");
  const tokenUri = asString(serviceAccount.token_uri) || "https://oauth2.googleapis.com/token";

  if (!clientEmail || !privateKey) {
    throw new Error("GA4 service account JSON must include client_email and private_key.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const jwtHeader = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtPayload = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: tokenUri,
      exp: issuedAt + 3600,
      iat: issuedAt,
    })
  );
  const unsignedToken = `${jwtHeader}.${jwtPayload}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsignedToken).sign(privateKey);
  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;

  const result = await fetchJson(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!result.ok) {
    throw new Error(`GA4 service account token request failed with HTTP ${result.status}.`);
  }

  const body = result.body as { access_token?: string };
  const accessToken = asString(body.access_token);
  if (!accessToken) {
    throw new Error("GA4 service account token response did not include an access token.");
  }

  return accessToken;
}

async function getGa4AccessToken(integration: SeoIntegration) {
  const secrets = parseSecretMap(integration);

  if (secrets.accessToken || secrets.bearerToken || secrets.token) {
    return secrets.accessToken || secrets.bearerToken || secrets.token;
  }

  if (secrets.serviceAccountJson || secrets.credentials) {
    return getGoogleServiceAccountAccessToken(secrets.serviceAccountJson || secrets.credentials);
  }

  throw new Error("GA4 credentials are required. Add an access token or service account JSON.");
}

function parseSecretMap(integration: SeoIntegration): SecretMap {
  const raw = decryptSecret(integration.encrypted_secret);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid secret payload.");
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [key, asString(value)])
        .filter(([, value]) => Boolean(value))
    );
  } catch {
    throw new Error("Stored integration secret payload could not be read.");
  }
}

function getOpenAiApiKey(integration: SeoIntegration) {
  const secrets = parseSecretMap(integration);
  const apiKey = secrets.apiKey || secrets.token;

  if (!apiKey) {
    throw new Error("Stored OpenAI token is unavailable.");
  }

  return apiKey;
}

function getConfiguredOpenAiApiKey(integration?: SeoIntegration | null) {
  if (integration) {
    return getOpenAiApiKey(integration);
  }

  const envKey = asString(process.env.OPENAI_API_KEY);
  if (!envKey) {
    throw new Error("OpenAI token is unavailable.");
  }

  return envKey;
}

function getAvailableOpenAiApiKey(integration?: SeoIntegration | null) {
  const envKey = asString(process.env.OPENAI_API_KEY);

  if (envKey) {
    return envKey;
  }

  if (integration) {
    return getOpenAiApiKey(integration);
  }

  throw new Error("OpenAI token is unavailable.");
}

async function recordAuditEvent({ scope, action, entityType, entityId = null, metadata = {} }: AuditPayload) {
  const { auditEvents } = await getSeoCollections();
  await auditEvents.insertOne({
    id: randomUUID(),
    user_id: scope.userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata_json: metadata,
    created_at: nowIso(),
  });
}

export async function listClients() {
  const { clients } = await getSeoCollections();
  const rows = await clients.find({}).sort({ name: 1 }).toArray();

  if (rows.length) {
    return rows.map(({ _id: _mongoId, ...row }) => row);
  }

  const timestamp = nowIso();
  const demoClient: SeoClient = {
    id: DEFAULT_CLIENT_ID,
    name: "Demo Client",
    notes: "Default workspace for local setup.",
    created_at: timestamp,
    updated_at: timestamp,
  };
  await clients.updateOne({ id: demoClient.id }, { $setOnInsert: demoClient }, { upsert: true });
  return [demoClient];
}

export async function createClient(payload: ClientPayload) {
  const { clients } = await getSeoCollections();
  const name = asString(payload.name);

  if (!name) {
    throw new Error("Client name is required.");
  }

  const id = await assignClientId(clients, name, asString(payload.id));

  const timestamp = nowIso();
  const client: SeoClient = {
    id,
    name: name.slice(0, 120),
    notes: asString(payload.notes).slice(0, 400) || null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await clients.insertOne(client);
  await recordAuditEvent({
    scope: { userId: id },
    action: "client.created",
    entityType: "client",
    entityId: id,
    metadata: { name: client.name },
  });
  return client;
}

export async function listIntegrations(scope: SeoTenantScope) {
  const { integrations } = await getSeoCollections();
  const rows = await integrations.find({ user_id: scope.userId }).sort({ created_at: 1 }).toArray();
  return rows.map(safeIntegration);
}

export async function upsertIntegration(scope: SeoTenantScope, payload: IntegrationPayload) {
  const { integrations } = await getSeoCollections();
  const { provider, config: inputConfig } = validateIntegrationPayload(payload);
  const { config, secrets } = stripSecrets(inputConfig);
  const encryptedSecret = Object.keys(secrets).length ? encryptSecret(JSON.stringify(secrets)) : null;
  const timestamp = nowIso();
  const displayName =
    asString(payload.display_name) || asString(config.displayName) || asString(config.name) || provider.toUpperCase();
  const existing =
    payload.integrationId
      ? await integrations.findOne({ user_id: scope.userId, provider, id: payload.integrationId })
      : provider !== "mcp"
        ? await integrations.findOne({ user_id: scope.userId, provider })
        : null;

  if (existing) {
    const next: SeoIntegration = {
      ...existing,
      display_name: displayName,
      config_json: config,
      encrypted_secret: encryptedSecret || existing.encrypted_secret || null,
      updated_at: timestamp,
    };
    await integrations.replaceOne({ id: existing.id, user_id: scope.userId }, next);
    await recordAuditEvent({
      scope,
      action: "integration.updated",
      entityType: "integration",
      entityId: next.id,
      metadata: { provider, has_secret: Boolean(encryptedSecret || existing.encrypted_secret) },
    });
    return safeIntegration(next);
  }

  const integration: SeoIntegration = {
    id: randomUUID(),
    user_id: scope.userId,
    provider,
    display_name: displayName,
    status: "disconnected",
    config_json: config,
    encrypted_secret: encryptedSecret,
    last_tested_at: null,
    last_error: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await integrations.insertOne(integration);
  await recordAuditEvent({
    scope,
    action: "integration.created",
    entityType: "integration",
    entityId: integration.id,
    metadata: { provider, has_secret: Boolean(encryptedSecret) },
  });
  return safeIntegration(integration);
}

export async function deleteIntegration(scope: SeoTenantScope, id: string) {
  const { integrations } = await getSeoCollections();
  const result = await integrations.deleteOne({ id, user_id: scope.userId });
  if (result.deletedCount === 1) {
    await recordAuditEvent({
      scope,
      action: "integration.deleted",
      entityType: "integration",
      entityId: id,
    });
  }
  return { deleted: result.deletedCount === 1 };
}

async function testOpenAi(integration: SeoIntegration) {
  const secrets = parseSecretMap(integration);
  const apiKey = secrets.apiKey || secrets.token;

  if (!apiKey) {
    throw new Error("OpenAI token is not configured.");
  }

  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
    throw new Error("OpenAI token format is invalid.");
  }

  const result = await fetchJson("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!result.ok) {
    throw new Error(`OpenAI token check failed with HTTP ${result.status}.`);
  }

  return { ok: true, detail: "OpenAI API token accepted." };
}

async function testGa4(integration: SeoIntegration) {
  const propertyId = normalizeGa4PropertyId(integration.config_json?.propertyId);
  const accessToken = await getGa4AccessToken(integration);
  const result = await fetchJson(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      metrics: [{ name: "activeUsers" }],
      limit: 1,
    }),
  });

  if (!result.ok) {
    throw new Error(`GA4 Data API test failed with HTTP ${result.status}.`);
  }

  return { ok: true, detail: "GA4 Data API returned a report." };
}

async function testGtm(integration: SeoIntegration) {
  const secrets = parseSecretMap(integration);
  if (!secrets.accessToken && !secrets.refreshToken && !secrets.clientSecret) {
    throw new Error("GTM credentials not configured; saved account/container metadata only.");
  }

  throw new Error("GTM OAuth/API validation is not configured in this MVP.");
}

async function testHotjar(integration: SeoIntegration) {
  const config = integration.config_json || {};
  const secrets = parseSecretMap(integration);
  const baseUrl = asString(config.baseUrl);

  if (baseUrl) {
    const url = validateHttpUrl(baseUrl);
    const result = await fetchJson(new URL("/health", url).toString(), {
      headers: secrets.apiKey ? { Authorization: `Bearer ${secrets.apiKey}` } : {},
    });
    if (!result.ok) {
      throw new Error(`Hotjar connector health check failed with HTTP ${result.status}.`);
    }
    return { ok: true, detail: "Hotjar connector health endpoint responded." };
  }

  return { ok: true, detail: "Hotjar connector metadata saved; official API check not configured." };
}

async function testMcp(integration: SeoIntegration) {
  const config = integration.config_json || {};
  const secrets = parseSecretMap(integration);
  const baseUrl = validateHttpUrl(config.baseUrl);
  const headers: Record<string, string> = {};

  if (config.authType === "bearer" && secrets.token) {
    headers.Authorization = `Bearer ${secrets.token}`;
  }

  const candidates = ["/.well-known/oauth-protected-resource", "/health", "/metadata"];
  const results = [];

  for (const path of candidates) {
    const result = await fetchJson(new URL(path, baseUrl).toString(), { headers });
    results.push({ path, status: result.status, ok: result.ok });
    if (result.ok) {
      return { ok: true, detail: `Remote MCP connector responded at ${path}.`, results };
    }
  }

  throw new Error(`Remote MCP connector did not respond successfully: ${JSON.stringify(results)}.`);
}

export async function testIntegration(scope: SeoTenantScope, id: string) {
  const { integrations } = await getSeoCollections();
  const integration = await integrations.findOne({ id, user_id: scope.userId });

  if (!integration) {
    throw new Error("Integration not found.");
  }

  try {
    const result =
      integration.provider === "openai"
        ? await testOpenAi(integration)
        : integration.provider === "ga4"
          ? await testGa4(integration)
          : integration.provider === "gtm"
            ? await testGtm(integration)
            : integration.provider === "hotjar"
              ? await testHotjar(integration)
              : integration.provider === "mcp"
                ? await testMcp(integration)
                : { ok: true, detail: "Connector metadata saved; live validation not implemented." };

    const updated: SeoIntegration = {
      ...integration,
      status: "connected",
      last_tested_at: nowIso(),
      last_error: null,
      updated_at: nowIso(),
    };
    await integrations.replaceOne({ id, user_id: scope.userId }, updated);
    await recordAuditEvent({
      scope,
      action: "integration.tested",
      entityType: "integration",
      entityId: id,
      metadata: { provider: integration.provider, status: "connected" },
    });
    return { integration: safeIntegration(updated), result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed.";
    const updated: SeoIntegration = {
      ...integration,
      status: "error",
      last_tested_at: nowIso(),
      last_error: message,
      updated_at: nowIso(),
    };
    await integrations.replaceOne({ id, user_id: scope.userId }, updated);
    await recordAuditEvent({
      scope,
      action: "integration.test_failed",
      entityType: "integration",
      entityId: id,
      metadata: { provider: integration.provider, status: "error", error: message },
    });
    throw new Error(message);
  }
}

export function buildInsightPrompt(payload: Record<string, unknown>) {
  return [
    {
      role: "system",
      content:
        "You are an SEO and product analytics intelligence system. Analyze analytics, SEO, behavior, and connector health data. Return only valid JSON.",
    },
    {
      role: "user",
      content: `Given this data:\n${JSON.stringify(payload)}\n\nGenerate a JSON object with an "insights" array. Each insight must include title, description, impact, recommendation, priority, confidence_score, and source_provider.\n\nRules:\n- Do not invent data.\n- If evidence is weak, lower confidence.\n- Prefer specific recommendations over generic SEO advice.\n- Correlate sources when possible.\n- Mention missing data as setup gaps.\n- Return valid JSON only.`,
    },
  ];
}

function parseLines(rawValue: unknown) {
  return asString(rawValue)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function parseCompetitors(rawValue: unknown) {
  return parseLines(rawValue).map((item) => {
    const match = item.match(/^(.*?)\s+(https?:\/\/\S+)$/i);
    if (match) {
      return { name: match[1].trim(), url: match[2].trim() };
    }

    if (/^https?:\/\//i.test(item)) {
      return { name: item.replace(/^https?:\/\//i, "").replace(/\/$/, ""), url: item };
    }

    return { name: item, url: null };
  });
}

function dedupeCompetitors(competitors: Array<{ name: string; url: string | null }>) {
  const seen = new Set<string>();
  return competitors
    .filter((competitor) => {
      const key = (competitor.url || competitor.name).toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_COMPETITOR_SITES);
}

export function validateCompetitiveAnalysisPayload(payload: CompetitiveAnalysisPayload) {
  const clientName = asString(payload.clientName).slice(0, 140);
  const suppliedIndustry = asString(payload.industry).slice(0, 140);
  const industry = suppliedIndustry || "Unspecified industry";
  const websiteUrl = asString(payload.websiteUrl);
  const market = asString(payload.market).slice(0, 140);
  const targetAudience = asString(payload.targetAudience).slice(0, 240);
  const competitors = dedupeCompetitors(parseCompetitors(payload.competitors));
  const targetKeywords = parseLines(payload.targetKeywords);
  const notes = asString(payload.notes).slice(0, 1000);
  const contextAssumptions = Array.isArray(payload.contextAssumptions)
    ? payload.contextAssumptions.map((item) => asString(item).slice(0, 320)).filter(Boolean).slice(0, 8)
    : [];

  if (!clientName) {
    throw new Error("Client name is required for competitive analysis.");
  }

  if (!suppliedIndustry) {
    contextAssumptions.push("Industry was not supplied directly.");
  }

  if (websiteUrl) {
    validateHttpUrl(websiteUrl, "websiteUrl");
  }

  competitors.forEach((competitor, index) => {
    if (competitor.url) {
      validateHttpUrl(competitor.url, `competitors[${index}].url`);
    }
  });

  return {
    clientName,
    industry,
    websiteUrl: websiteUrl || null,
    market: market || null,
    targetAudience: targetAudience || null,
    competitors,
    targetKeywords,
    notes,
    contextAssumptions: contextAssumptions.slice(0, 8),
  };
}

function textFromParts(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function normalizeCrawlUrl(rawUrl: string) {
  const url = validateHttpUrl(rawUrl, "crawlUrl");
  assertPublicCrawlTarget(url);
  url.hash = "";
  return url;
}

function assertPublicCrawlTarget(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateIpv4 =
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

  if (hostname === "localhost" || hostname === "::1" || hostname === "0.0.0.0" || privateIpv4) {
    throw new Error("crawlUrl must target a public website.");
  }
}

function classifyPage(url: string, text: string) {
  const input = `${url} ${text}`.toLowerCase();
  const categories: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["pricing", /\bpricing\b|\bplans?\b|\bpackages?\b/],
    ["services", /\bservices?\b|\bsolutions?\b|\bfeatures?\b/],
    ["case_study", /\bcase-stud(y|ies)\b|\bcase stud(y|ies)\b|\bcustomer stor(y|ies)\b/],
    ["blog", /\bblog\b|\bresources?\b|\binsights?\b|\blearn\b/],
    ["about", /\babout\b|\bcompany\b|\bteam\b/],
    ["faq", /\bfaq\b|\bfrequently asked\b|\bquestions\b/],
    ["contact", /\bcontact\b|\bget in touch\b|\btalk to\b/],
    ["comparison", /\bcompare\b|\bversus\b|\bvs\.?\b|\balternative(s)?\b/],
    ["industry", /\bindustr(y|ies)\b|\bfor [a-z ]+\b/],
    ["location", /\blocations?\b|\bnear me\b|\bservice area\b/],
  ];

  for (const [category, pattern] of checks) {
    if (pattern.test(input)) {
      categories.push(category);
    }
  }

  return categories.slice(0, 8);
}

function featureEvidence(featureId: string, label: string, url: string): SeoCompetitiveFeatureEvidence {
  return { feature: featureId, label, urls: [url] };
}

function detectWebsiteFeatures(page: {
  url: string;
  title: string | null;
  metaDescription: string | null;
  headings: string[];
  navLabels: string[];
  ctaText: string[];
  schemaTypes: string[];
  pageCategories: string[];
}) {
  const evidence = new Map<string, SeoCompetitiveFeatureEvidence>();
  const text = textFromParts([
    page.url,
    page.title || "",
    page.metaDescription || "",
    ...page.headings,
    ...page.navLabels,
    ...page.ctaText,
    ...page.schemaTypes,
    ...page.pageCategories,
  ]);

  for (const feature of WEBSITE_FEATURES) {
    const categoryMatch = feature.pageCategories?.some((category) => page.pageCategories.includes(category));
    const textMatch = feature.patterns.some((pattern) => pattern.test(text));
    if (categoryMatch || textMatch) {
      evidence.set(feature.id, featureEvidence(feature.id, feature.label, page.url));
    }
  }

  if (page.schemaTypes.length) {
    evidence.set("structured_schema", featureEvidence("structured_schema", "Structured data schema", page.url));
  }

  return [...evidence.values()];
}

export function extractWebsiteFacts(html: string, pageUrl: string): SeoCompetitiveCrawlPage {
  const $ = load(html);
  const schemaTypes = $('script[type="application/ld+json"]')
    .map((_, element) => {
      try {
        const parsed = JSON.parse($(element).text());
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        return rows
          .map((row) => (row && typeof row === "object" ? asString((row as Record<string, unknown>)["@type"]) : ""))
          .filter(Boolean)
          .join(",");
      } catch {
        return "";
      }
    })
    .get()
    .flatMap((value) => value.split(","))
    .filter(Boolean)
    .slice(0, 12);
  $("script, style, noscript, svg").remove();

  const title = cleanText($("title").first().text()) || null;
  const metaDescription = cleanText($('meta[name="description"]').attr("content") || "") || null;
  const headings = $("h1, h2, h3")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 24);
  const navLabels = $("nav a, header a")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 30);
  const ctaText = $('a, button, input[type="submit"]')
    .map((_, element) => cleanText($(element).text() || $(element).attr("value") || ""))
    .get()
    .filter((value) => /\b(get|book|schedule|start|try|contact|demo|download|subscribe|quote|call)\b/i.test(value))
    .slice(0, 18);
  const visibleText = cleanText($("body").text()).slice(0, 1200);
  const pageCategories = classifyPage(pageUrl, textFromParts([visibleText, ...headings, ...navLabels]));
  const features = detectWebsiteFeatures({
    url: pageUrl,
    title,
    metaDescription,
    headings,
    navLabels,
    ctaText,
    schemaTypes,
    pageCategories,
  });

  return {
    url: pageUrl,
    status: "success",
    status_code: 200,
    title,
    meta_description: metaDescription,
    headings,
    nav_labels: navLabels,
    cta_text: ctaText,
    schema_types: schemaTypes,
    page_categories: pageCategories,
    features,
    error: null,
  };
}

function collectInternalKeyLinks(html: string, baseUrl: URL) {
  const $ = load(html);
  const links = $("a[href]")
    .map((_, element) => asString($(element).attr("href")))
    .get()
    .map((href) => {
      try {
        const url = new URL(href, baseUrl);
        url.hash = "";
        return url;
      } catch {
        return null;
      }
    })
    .filter((url): url is URL => Boolean(url))
    .filter((url) => url.origin === baseUrl.origin && (url.protocol === "http:" || url.protocol === "https:"))
    .filter((url) => KEY_PAGE_PATTERNS.some((pattern) => pattern.test(`${url.pathname} ${url.search}`.toLowerCase())));

  const seen = new Set<string>([baseUrl.toString()]);
  return links
    .filter((url) => {
      const key = url.toString();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CRAWL_PAGES_PER_SITE - 1);
}

async function readLimitedText(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Unsupported content type: ${contentType.slice(0, 80)}`);
  }

  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > MAX_CRAWL_BYTES) {
      await reader.cancel();
      throw new Error(`Page exceeded ${MAX_CRAWL_BYTES} byte crawl limit.`);
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function fetchHtmlPage(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "CircleClickSEOResearchBot/1.0 (+https://circleclick.com)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      html: await readLimitedText(response),
      statusCode: response.status,
      finalUrl: response.url,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function failedCrawlPage(url: string, status: SeoCompetitiveCrawlPage["status"], error: string): SeoCompetitiveCrawlPage {
  return {
    url,
    status,
    status_code: null,
    title: null,
    meta_description: null,
    headings: [],
    nav_labels: [],
    cta_text: [],
    schema_types: [],
    page_categories: [],
    features: [],
    error: error.slice(0, 240),
  };
}

function mergeFeatureEvidence(pages: SeoCompetitiveCrawlPage[]) {
  const merged = new Map<string, SeoCompetitiveFeatureEvidence>();
  for (const page of pages) {
    for (const feature of page.features) {
      const current = merged.get(feature.feature);
      if (current) {
        current.urls = [...new Set([...current.urls, ...feature.urls])].slice(0, 5);
      } else {
        merged.set(feature.feature, { ...feature, urls: feature.urls.slice(0, 5) });
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label));
}

async function crawlWebsite(site: { site_role: "client" | "competitor"; name: string; url: string | null }): Promise<SeoCompetitiveCrawlSite> {
  if (!site.url) {
    return {
      site_role: site.site_role,
      name: site.name,
      url: null,
      status: "skipped",
      feature_count: 0,
      pages: [failedCrawlPage("", "skipped", "No URL was supplied.")],
      features: [],
      errors: ["No URL was supplied."],
    };
  }

  let baseUrl: URL;
  try {
    baseUrl = normalizeCrawlUrl(site.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid URL.";
    return {
      site_role: site.site_role,
      name: site.name,
      url: site.url,
      status: "failed",
      feature_count: 0,
      pages: [failedCrawlPage(site.url, "invalid_url", message)],
      features: [],
      errors: [message],
    };
  }

  const pages: SeoCompetitiveCrawlPage[] = [];
  const errors: string[] = [];
  let keyLinks: URL[] = [];

  try {
    const home = await fetchHtmlPage(baseUrl);
    const homeFacts = extractWebsiteFacts(home.html, home.finalUrl || baseUrl.toString());
    homeFacts.status_code = home.statusCode;
    pages.push(homeFacts);
    keyLinks = collectInternalKeyLinks(home.html, baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to crawl homepage.";
    const status = message === "timeout" ? "timeout" : "fetch_error";
    pages.push(failedCrawlPage(baseUrl.toString(), status, message));
    errors.push(message);
  }

  for (const url of keyLinks) {
    try {
      const page = await fetchHtmlPage(url);
      const facts = extractWebsiteFacts(page.html, page.finalUrl || url.toString());
      facts.status_code = page.statusCode;
      pages.push(facts);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to crawl page.";
      const status = message === "timeout" ? "timeout" : "fetch_error";
      pages.push(failedCrawlPage(url.toString(), status, message));
      errors.push(`${url.pathname}: ${message}`);
    }
  }

  const features = mergeFeatureEvidence(pages);
  const successCount = pages.filter((page) => page.status === "success").length;
  const status = successCount === 0 ? "failed" : errors.length ? "partial" : "success";

  return {
    site_role: site.site_role,
    name: site.name,
    url: baseUrl.toString(),
    status,
    feature_count: features.length,
    pages,
    features,
    errors: errors.slice(0, 8),
  };
}

function patternFromFeature(feature: SeoCompetitiveFeatureEvidence, competitors: string[]): SeoCompetitivePattern {
  return {
    feature: feature.feature,
    label: feature.label,
    competitors,
    evidence_urls: feature.urls.slice(0, 8),
  };
}

function featuresById(site: SeoCompetitiveCrawlSite | undefined) {
  return new Map((site?.features || []).map((feature) => [feature.feature, feature]));
}

export function compareCompetitiveWebsites(crawlEvidence: SeoCompetitiveCrawlSite[]) {
  const client = crawlEvidence.find((site) => site.site_role === "client");
  const competitors = crawlEvidence.filter((site) => site.site_role === "competitor" && site.status !== "skipped");
  const clientFeatures = featuresById(client);
  const competitorFeatureMap = new Map<string, { feature: SeoCompetitiveFeatureEvidence; sites: SeoCompetitiveCrawlSite[] }>();

  for (const competitor of competitors) {
    for (const feature of competitor.features) {
      const current = competitorFeatureMap.get(feature.feature);
      if (current) {
        current.sites.push(competitor);
        current.feature.urls = [...new Set([...current.feature.urls, ...feature.urls])].slice(0, 8);
      } else {
        competitorFeatureMap.set(feature.feature, { feature: { ...feature }, sites: [competitor] });
      }
    }
  }

  const competitorPatterns = [...competitorFeatureMap.values()].map((entry) =>
    patternFromFeature(
      entry.feature,
      entry.sites.map((site) => site.name)
    )
  );
  const missingFromClient = competitorPatterns
    .filter((pattern) => !clientFeatures.has(pattern.feature))
    .sort((a, b) => b.competitors.length - a.competitors.length || a.label.localeCompare(b.label));
  const sharedPatterns = competitorPatterns.filter((pattern) => clientFeatures.has(pattern.feature));
  const clientStrengths = [...clientFeatures.values()]
    .filter((feature) => !competitorFeatureMap.has(feature.feature))
    .map((feature) => patternFromFeature(feature, [client?.name || "Client"]));
  const topPerformers = competitors
    .slice()
    .sort((a, b) => b.feature_count - a.feature_count)
    .slice(0, 3)
    .map((site) => ({ name: site.name, url: site.url, feature_count: site.feature_count }));

  return {
    missing_from_client: missingFromClient.slice(0, 10),
    competitor_only_patterns: missingFromClient.slice(0, 10),
    shared_patterns: sharedPatterns.slice(0, 10),
    client_strengths: clientStrengths.slice(0, 10),
    top_performers: topPerformers,
  };
}

function deterministicCompetitiveAnalysis(
  payload: ReturnType<typeof validateCompetitiveAnalysisPayload>,
  crawlEvidence: SeoCompetitiveCrawlSite[]
) {
  const comparison = compareCompetitiveWebsites(crawlEvidence);
  const clientSite = crawlEvidence.find((site) => site.site_role === "client");
  const competitorsWithUrls = crawlEvidence.filter((site) => site.site_role === "competitor" && site.url);
  const missingLabels = comparison.missing_from_client.map((pattern) => pattern.label);
  const sharedLabels = comparison.shared_patterns.map((pattern) => pattern.label);
  const sourceUrls = crawlEvidence.flatMap((site) => site.pages.map((page) => page.url)).filter(Boolean).slice(0, 12);
  const assumptions = [
    "Top performers are defined by observed feature coverage in this crawl, not by traffic, rankings, or revenue.",
    "The crawler executes no scripts and only reviews fetched HTML from the homepage plus obvious key internal pages.",
    ...payload.contextAssumptions,
  ];

  if (!payload.websiteUrl) {
    assumptions.push("No client website URL was supplied, so the client feature baseline could not be crawled.");
  }

  if (!competitorsWithUrls.length) {
    assumptions.push("No competitor URLs were available to crawl.");
  }

  crawlEvidence
    .filter((site) => site.status === "failed" || site.status === "partial")
    .forEach((site) => assumptions.push(`${site.name} crawl status was ${site.status}.`));

  return {
    summary: competitorsWithUrls.length
      ? `Crawled ${competitorsWithUrls.length} competitor site${competitorsWithUrls.length === 1 ? "" : "s"} and compared observed website features against ${payload.clientName}.`
      : `Built a crawl-first competitive baseline for ${payload.clientName}, but no competitor websites were available for comparison.`,
    positioning: missingLabels.length
      ? `${payload.clientName} should close the clearest website gaps around ${missingLabels.slice(0, 3).join(", ")}.`
      : sharedLabels.length
        ? `${payload.clientName} already shares the main observed website patterns from this competitor set.`
        : "More crawlable competitor evidence is needed before making a strong positioning recommendation.",
    competitor_themes: comparison.top_performers.length
      ? comparison.top_performers.map((site) => `${site.name}: ${site.feature_count} observed website features`)
      : ["No crawlable competitor feature themes were observed."],
    content_gaps: missingLabels.length ? missingLabels : ["No competitor-only content gaps were observed in this crawl."],
    keyword_opportunities: payload.targetKeywords.length
      ? payload.targetKeywords
      : comparison.missing_from_client.slice(0, 5).map((pattern) => pattern.label),
    recommendations: comparison.missing_from_client.length
      ? comparison.missing_from_client.slice(0, 5).map((pattern) => ({
          title: `Add or improve ${pattern.label.toLowerCase()}`,
          rationale: `${pattern.competitors.join(", ")} show this pattern, but it was not observed on ${payload.clientName}'s crawl.`,
          priority: pattern.competitors.length >= 2 ? "high" : ("medium" as SeoPriority),
        }))
      : [
          {
            title: "Expand competitor evidence",
            rationale: "The first crawl did not find clear competitor-only website patterns.",
            priority: "medium" as SeoPriority,
          },
        ],
    report_draft: [
      {
        heading: "Executive summary",
        body: competitorsWithUrls.length
          ? `${payload.clientName} was compared against ${competitorsWithUrls.map((site) => site.name).join(", ")} using crawlable public website evidence.`
          : `${payload.clientName} has a crawl-first competitive baseline, but competitor website evidence is still thin.`,
        source_urls: sourceUrls,
      },
      {
        heading: "Most visible gaps",
        body: missingLabels.length
          ? `The clearest observed gaps are ${missingLabels.slice(0, 5).join(", ")}. These are website patterns competitors show but the client crawl did not.`
          : "The current crawl did not find a strong competitor-only website pattern. Add more competitor URLs or key pages before making a stronger claim.",
        source_urls: comparison.missing_from_client.flatMap((pattern) => pattern.evidence_urls).slice(0, 12),
      },
      {
        heading: "Recommended positioning move",
        body: missingLabels.length
          ? `Prioritize a credible story around ${missingLabels.slice(0, 3).join(", ")} only if the client can support those claims operationally.`
          : "Use the current evidence as a baseline, then expand research before changing positioning.",
        source_urls: sourceUrls,
      },
    ],
    assumptions,
    confidence_score: Math.min(
      92,
      Math.max(35, 45 + (clientSite?.feature_count || 0) * 3 + competitorsWithUrls.length * 5 - assumptions.length * 3)
    ),
    ...comparison,
    crawl_evidence: crawlEvidence,
  };
}

async function discoverCompetitors(payload: ReturnType<typeof validateCompetitiveAnalysisPayload>) {
  const endpoint = asString(process.env.SEO_COMPETITOR_SEARCH_ENDPOINT);
  const apiKey = asString(process.env.SEO_COMPETITOR_SEARCH_API_KEY);

  if (!endpoint || !apiKey) {
    return [];
  }

  try {
    const result = await fetchJson(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientName: payload.clientName,
        industry: payload.industry,
        market: payload.market,
        targetKeywords: payload.targetKeywords,
      }),
    });

    if (!result.ok) {
      return [];
    }

    const body = result.body as { competitors?: unknown };
    if (Array.isArray(body.competitors)) {
      return body.competitors
        .map((item) => {
          if (typeof item === "string") {
            return parseCompetitors(item)[0];
          }
          const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          const url = asString(row.url);
          return {
            name: asString(row.name) || (url ? url.replace(/^https?:\/\//i, "").replace(/\/$/, "") : ""),
            url: url || null,
          };
        })
        .filter((competitor) => competitor?.name && competitor.url);
    }

    return parseCompetitors(body.competitors).filter((competitor) => competitor.url);
  } catch {
    return [];
  }
}

function needsCompetitiveBriefAutofill(payload: CompetitiveAnalysisPayload) {
  return !asString(payload.websiteUrl) || !asString(payload.industry) || !parseCompetitors(payload.competitors).length;
}

function normalizeAutofillUrl(value: unknown) {
  const rawUrl = asString(value);
  if (!rawUrl) {
    return "";
  }

  try {
    const url = validateHttpUrl(rawUrl, "autofillUrl");
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function formatAutofillCompetitors(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .slice(0, 5)
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const name = asString(row.name).slice(0, 140);
      const url = normalizeAutofillUrl(row.url);

      if (!name) {
        return "";
      }

      return url ? `${name} ${url}` : name;
    })
    .filter(Boolean)
    .join("\n");
}

function buildCompetitiveBriefAutofillPrompt(payload: CompetitiveAnalysisPayload) {
  return [
    {
      role: "system",
      content:
        "You prepare competitive research inputs for a crawl-based SEO dashboard. Return only valid JSON. Prefer leaving URL fields empty over inventing exact URLs. Do not claim live rankings, traffic, revenue, or market share.",
    },
    {
      role: "user",
      content: `Auto-fill the missing competitive research brief for this company:\n${JSON.stringify({
        clientName: asString(payload.clientName),
        websiteUrl: asString(payload.websiteUrl),
        industry: asString(payload.industry),
        market: asString(payload.market),
        targetAudience: asString(payload.targetAudience),
        competitors: asString(payload.competitors),
        targetKeywords: asString(payload.targetKeywords),
        notes: asString(payload.notes),
      })}\n\nReturn this exact JSON shape:\n{\n  "websiteUrl": "official homepage URL if reasonably confident, otherwise empty string",\n  "industry": "plain industry/category",\n  "market": "likely market or geography, otherwise empty string",\n  "targetAudience": "likely buyer/user audience, otherwise empty string",\n  "competitors": [{ "name": "competitor name", "url": "official homepage URL if reasonably confident, otherwise empty string" }],\n  "targetKeywords": ["search topics likely relevant to this company"],\n  "notes": "short context summary for the later report",\n  "assumptions": ["uncertainty or inference caveat"]\n}\n\nRules:\n- Preserve any user-supplied values.\n- Use the company name to infer enough context for a first-pass crawl.\n- Return 2-5 competitors when you can identify likely direct alternatives.\n- Use official homepages only when you are reasonably confident.\n- Make uncertainty visible in assumptions.`,
    },
  ];
}

export function mergeCompetitiveBriefAutofill(payload: CompetitiveAnalysisPayload, rawAutofill: unknown): CompetitiveAnalysisPayload {
  const row = rawAutofill && typeof rawAutofill === "object" ? (rawAutofill as Record<string, unknown>) : {};
  const autofillNotes = asString(row.notes).slice(0, 800);
  const existingNotes = asString(payload.notes).slice(0, 1000);
  const assumptions = Array.isArray(row.assumptions)
    ? row.assumptions.map((item) => asString(item).slice(0, 320)).filter(Boolean).slice(0, 8)
    : [];
  const autofillCompetitors = formatAutofillCompetitors(row.competitors);
  const autofillKeywords = Array.isArray(row.targetKeywords)
    ? row.targetKeywords.map((item) => asString(item).slice(0, 120)).filter(Boolean).slice(0, 8).join("\n")
    : "";

  return {
    ...payload,
    websiteUrl: asString(payload.websiteUrl) || normalizeAutofillUrl(row.websiteUrl),
    industry: asString(payload.industry) || asString(row.industry).slice(0, 140),
    market: asString(payload.market) || asString(row.market).slice(0, 140),
    targetAudience: asString(payload.targetAudience) || asString(row.targetAudience).slice(0, 240),
    competitors: asString(payload.competitors) || autofillCompetitors,
    targetKeywords: asString(payload.targetKeywords) || autofillKeywords,
    notes: [existingNotes, autofillNotes].filter(Boolean).join("\n\n").slice(0, 1000),
    contextAssumptions: [
      ...(payload.contextAssumptions || []),
      "Research context was auto-filled from the company name using OpenAI before crawling public pages.",
      ...assumptions,
    ].slice(0, 8),
  };
}

async function autofillCompetitiveBrief(
  payload: CompetitiveAnalysisPayload,
  openAi: SeoIntegration | null,
  hasEnvOpenAiKey: boolean
) {
  if (!needsCompetitiveBriefAutofill(payload)) {
    return payload;
  }

  if (!openAi && !hasEnvOpenAiKey) {
    return {
      ...payload,
      contextAssumptions: [
        ...(payload.contextAssumptions || []),
        "OpenAI was not connected, so the research brief could not be auto-filled from company name alone.",
      ],
    };
  }

  try {
    const apiKey = getAvailableOpenAiApiKey(openAi);
    const result = await fetchJson("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini",
        temperature: 0.15,
        response_format: competitiveBriefAutofillResponseFormat,
        messages: buildCompetitiveBriefAutofillPrompt(payload),
      }),
    });

    if (!result.ok) {
      throw new Error(`OpenAI brief auto-fill failed with HTTP ${result.status}.`);
    }

    const body = result.body as { choices?: Array<{ message?: { content?: string; refusal?: string } }> };
    if (body.choices?.[0]?.message?.refusal) {
      throw new Error("OpenAI refused to auto-fill the competitive brief.");
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty auto-fill response.");
    }

    return mergeCompetitiveBriefAutofill(payload, JSON.parse(content));
  } catch (error) {
    return {
      ...payload,
      contextAssumptions: [
        ...(payload.contextAssumptions || []),
        `OpenAI brief auto-fill was skipped: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
    };
  }
}

function buildCompetitiveAnalysisPrompt(payload: Record<string, unknown>) {
  return [
    {
      role: "system",
      content:
        "You are a competitive SEO and positioning analyst. Return only valid JSON. Do not claim live rankings, current SERP positions, traffic estimates, or facts not present in the provided data.",
    },
    {
      role: "user",
      content: `Given this client and market data:\n${JSON.stringify(payload)}\n\nGenerate one competitive analysis JSON object with this exact shape:\n{\n  "summary": "Concise competitive landscape summary",\n  "positioning": "How the client should be positioned against alternatives",\n  "competitor_themes": ["Theme observed or inferred from provided competitor names/data"],\n  "content_gaps": ["Content gap or missing asset"],\n  "keyword_opportunities": ["Keyword or topic cluster opportunity"],\n  "report_draft": [\n    {\n      "heading": "Client-ready section heading",\n      "body": "Evidence-backed report language the user can edit",\n      "source_urls": ["Only URLs present in the provided crawl evidence"]\n    }\n  ],\n  "recommendations": [\n    {\n      "title": "Specific action",\n      "rationale": "Why this matters",\n      "priority": "low | medium | high"\n    }\n  ],\n  "assumptions": ["Assumption or missing-data caveat"],\n  "confidence_score": 0-100\n}\n\nRules:\n- Use only provided data and stored connector status.\n- Treat deterministicAnalysis and crawl_evidence as the source of truth.\n- Every report_draft section must include source_urls from the provided evidence, or an empty array when evidence is missing.\n- Do not invent live competitor rankings or market share.\n- If evidence is weak, add caveats to assumptions and lower confidence.\n- Prefer specific SEO, content, and positioning actions.\n- Return valid JSON only.`,
    },
  ];
}

function normalizeStringArray(value: unknown, fieldName: string, maxItems = 8) {
  if (!Array.isArray(value)) {
    throw new Error(`Competitive analysis field ${fieldName} must be an array.`);
  }

  return value
    .map((item) => asString(item).slice(0, 320))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeRecommendations(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Competitive analysis recommendations must be an array.");
  }

  const recommendations = value.slice(0, 8).map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const title = asString(row.title);
    const rationale = asString(row.rationale);
    const priority = parsePriority(row.priority);

    if (!title || !rationale || !priority) {
      throw new Error(`Competitive recommendation at index ${index} is missing required fields.`);
    }

    return {
      title: title.slice(0, 180),
      rationale: rationale.slice(0, 600),
      priority,
    };
  });

  if (!recommendations.length) {
    throw new Error("Competitive analysis must include at least one recommendation.");
  }

  return recommendations;
}

function normalizeCompetitivePatterns(value: unknown): SeoCompetitivePattern[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 12)
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const feature = asString(row.feature).slice(0, 80);
      const label = asString(row.label).slice(0, 160);
      if (!feature || !label) {
        return null;
      }

      return {
        feature,
        label,
        competitors: Array.isArray(row.competitors)
          ? row.competitors.map((competitor) => asString(competitor).slice(0, 120)).filter(Boolean).slice(0, 8)
          : [],
        evidence_urls: Array.isArray(row.evidence_urls)
          ? row.evidence_urls.map((url) => asString(url).slice(0, 300)).filter(Boolean).slice(0, 8)
          : [],
      };
    })
    .filter((item): item is SeoCompetitivePattern => Boolean(item));
}

function normalizeReportDraft(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 6)
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const heading = asString(row.heading).slice(0, 160);
      const body = asString(row.body).slice(0, 1200);

      if (!heading || !body) {
        return null;
      }

      return {
        heading,
        body,
        source_urls: Array.isArray(row.source_urls)
          ? row.source_urls.map((url) => asString(url).slice(0, 300)).filter(Boolean).slice(0, 8)
          : [],
      };
    })
    .filter((item): item is { heading: string; body: string; source_urls: string[] } => Boolean(item));
}

function normalizeCrawlEvidence(value: unknown): SeoCompetitiveCrawlSite[] {
  return Array.isArray(value) ? (value.slice(0, MAX_COMPETITOR_SITES + 1) as SeoCompetitiveCrawlSite[]) : [];
}

export function normalizeCompetitiveAnalysis(
  rawAnalysis: unknown,
  payload: ReturnType<typeof validateCompetitiveAnalysisPayload>,
  scope: SeoTenantScope
): SeoCompetitiveAnalysis {
  const row = rawAnalysis && typeof rawAnalysis === "object" ? (rawAnalysis as Record<string, unknown>) : {};
  const summary = asString(row.summary);
  const positioning = asString(row.positioning);
  const confidenceScore = parseConfidenceScore(row.confidence_score);

  if (!summary || !positioning || confidenceScore === null) {
    throw new Error("Competitive analysis is missing summary, positioning, or confidence_score.");
  }

  return {
    id: randomUUID(),
    user_id: scope.userId,
    client_name: payload.clientName,
    website_url: payload.websiteUrl,
    industry: payload.industry,
    market: payload.market,
    target_audience: payload.targetAudience,
    competitors: payload.competitors,
    target_keywords: payload.targetKeywords,
    summary: summary.slice(0, 1400),
    positioning: positioning.slice(0, 1400),
    competitor_themes: normalizeStringArray(row.competitor_themes, "competitor_themes"),
    content_gaps: normalizeStringArray(row.content_gaps, "content_gaps"),
    keyword_opportunities: normalizeStringArray(row.keyword_opportunities, "keyword_opportunities"),
    missing_from_client: normalizeCompetitivePatterns(row.missing_from_client),
    competitor_only_patterns: normalizeCompetitivePatterns(row.competitor_only_patterns),
    shared_patterns: normalizeCompetitivePatterns(row.shared_patterns),
    client_strengths: normalizeCompetitivePatterns(row.client_strengths),
    crawl_evidence: normalizeCrawlEvidence(row.crawl_evidence),
    top_performers: Array.isArray(row.top_performers)
      ? row.top_performers
          .slice(0, 3)
          .map((item) => {
            const performer = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            return {
              name: asString(performer.name).slice(0, 140),
              url: asString(performer.url) || null,
              feature_count: Math.max(0, Math.round(Number(performer.feature_count) || 0)),
            };
          })
          .filter((item) => item.name)
      : [],
    report_draft: normalizeReportDraft(row.report_draft),
    recommendations: normalizeRecommendations(row.recommendations),
    assumptions: normalizeStringArray(row.assumptions, "assumptions", 10),
    confidence_score: confidenceScore,
    source_payload_json: payload,
    created_at: nowIso(),
  };
}

function parsePriority(value: unknown): SeoPriority | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function parseConfidenceScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizeInsights(rawInsights: unknown, scope: SeoTenantScope = { userId: "test-client" }): SeoInsight[] {
  if (!Array.isArray(rawInsights)) {
    throw new Error("AI response did not contain a JSON array.");
  }

  const normalized = rawInsights.slice(0, 7).map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const priority = parsePriority(row.priority);
    const confidenceScore = parseConfidenceScore(row.confidence_score);
    const title = asString(row.title);
    const description = asString(row.description);
    const impact = asString(row.impact);
    const recommendation = asString(row.recommendation);
    const sourceProvider = asString(row.source_provider);

    if (!title || !description || !impact || !recommendation || !priority || confidenceScore === null || !sourceProvider) {
      throw new Error(`AI insight at index ${index} is missing required fields.`);
    }

    return {
      id: randomUUID(),
      user_id: scope.userId,
      title: title.slice(0, 140),
      description: description.slice(0, 1200),
      impact: impact.slice(0, 1200),
      recommendation: recommendation.slice(0, 1200),
      priority,
      confidence_score: confidenceScore,
      source_provider: sourceProvider.slice(0, 40),
      source_payload_json: {},
      created_at: nowIso(),
    };
  });

  if (normalized.length < 1) {
    throw new Error("AI response did not include any insights.");
  }

  return normalized;
}

function extractInsightRows(parsed: unknown) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { insights?: unknown }).insights)) {
    return (parsed as { insights: unknown[] }).insights;
  }

  return parsed;
}

export async function listInsights(scope: SeoTenantScope) {
  const { insights } = await getSeoCollections();
  const rows = await insights.find({ user_id: scope.userId }).sort({ created_at: -1 }).toArray();
  return rows.map(({ _id: _mongoId, ...row }) => row);
}

export async function listMetricSnapshots(scope: SeoTenantScope) {
  const { metricSnapshots } = await getSeoCollections();
  const rows = await metricSnapshots.find({ user_id: scope.userId }).sort({ captured_at: -1 }).limit(100).toArray();
  return rows.map(({ _id: _mongoId, ...row }) => row);
}

function cleanSeoChangeRun(row: SeoChangeRun) {
  const { _id: _mongoId, ...cleaned } = row;
  return cleaned;
}

function cleanSeoWatchBaseline(row: SeoWatchBaseline) {
  const { _id: _mongoId, ...cleaned } = row;
  return cleaned;
}

function baselineFromRow(row: SeoWatchBaseline | null): SeoChangeTrackerBaseline | null {
  if (!row) return null;
  return row.baseline_json as unknown as SeoChangeTrackerBaseline;
}

export async function getSeoChangeTrackerState(scope: SeoTenantScope, rawSiteUrl?: string | null) {
  const { watchBaselines, changeRuns } = await getSeoCollections();
  const site = rawSiteUrl ? normalizeSeoChangeTrackerSite(rawSiteUrl) : null;
  const baselineRows = site
    ? await watchBaselines.find({ user_id: scope.userId, site_url: site.siteUrl }).limit(1).toArray()
    : await watchBaselines.find({ user_id: scope.userId }).sort({ updated_at: -1 }).limit(1).toArray();
  const baselineRow = baselineRows[0] || null;
  const runFilter: Record<string, string> = { user_id: scope.userId };
  if (site) {
    runFilter.site_url = site.siteUrl;
  }
  const runs = await changeRuns.find(runFilter).sort({ checked_at: -1 }).limit(SEO_CHANGE_RUN_LIMIT).toArray();

  return {
    baseline: baselineFromRow(baselineRow),
    baselineRow: baselineRow ? cleanSeoWatchBaseline(baselineRow) : null,
    runs: runs.map(cleanSeoChangeRun),
  };
}

export async function runPersistedSeoChangeTracker(scope: SeoTenantScope, input: SeoChangeTrackerInput) {
  const { watchBaselines, changeRuns } = await getSeoCollections();
  const site = normalizeSeoChangeTrackerSite(input.siteUrl);
  const existingBaseline = await watchBaselines.findOne({ user_id: scope.userId, site_url: site.siteUrl });
  const previousBaseline = baselineFromRow(existingBaseline);
  const result: SeoChangeTrackerResult = await runSeoChangeTracker({
    ...input,
    siteUrl: site.siteUrl,
    baseline: previousBaseline,
  });
  const checkedAt = result.checkedAt;
  const baselineRow: SeoWatchBaseline = {
    id: existingBaseline?.id || randomUUID(),
    user_id: scope.userId,
    site_url: site.siteUrl,
    site_origin: site.siteOrigin,
    baseline_json: result.baseline as unknown as Record<string, unknown>,
    page_count: result.baseline.pages.length,
    captured_at: result.baseline.capturedAt,
    created_at: existingBaseline?.created_at || checkedAt,
    updated_at: checkedAt,
  };

  if (existingBaseline) {
    await watchBaselines.replaceOne({ id: existingBaseline.id, user_id: scope.userId }, baselineRow);
  } else {
    await watchBaselines.insertOne(baselineRow);
  }

  const run: SeoChangeRun = {
    id: randomUUID(),
    user_id: scope.userId,
    baseline_id: baselineRow.id,
    site_url: site.siteUrl,
    site_origin: site.siteOrigin,
    status: result.status,
    summary_json: result.summary as unknown as Record<string, unknown>,
    changes_json: result.changes,
    pages_json: result.pages,
    previous_captured_at: existingBaseline?.captured_at || null,
    checked_at: checkedAt,
    created_at: checkedAt,
  };
  await changeRuns.insertOne(run);
  await recordAuditEvent({
    scope,
    action: "website_watch.seo_change_scanned",
    entityType: "sync",
    entityId: run.id,
    metadata: {
      site_url: site.siteUrl,
      status: result.status,
      changed_pages: result.summary.changedPages,
      changes: result.changes.length,
      previous_captured_at: run.previous_captured_at,
    },
  });

  const slackAlert = await notifySeoWatchSlack({ scope, result });
  if (slackAlert.status !== "skipped") {
    await recordAuditEvent({
      scope,
      action: slackAlert.status === "sent" ? "website_watch.slack_alert_sent" : "website_watch.slack_alert_failed",
      entityType: "sync",
      entityId: run.id,
      metadata: {
        site_url: site.siteUrl,
        tracker_status: result.status,
        slack_status: slackAlert.status,
        error: slackAlert.status === "failed" ? slackAlert.error : null,
      },
    }).catch(() => undefined);
  }

  return {
    result,
    baseline: baselineFromRow(baselineRow),
    run: cleanSeoChangeRun(run),
  };
}

export async function resetSeoWatchBaseline(scope: SeoTenantScope, rawSiteUrl: string) {
  const { watchBaselines } = await getSeoCollections();
  const site = normalizeSeoChangeTrackerSite(rawSiteUrl);
  const deleted = await watchBaselines.deleteMany({ user_id: scope.userId, site_url: site.siteUrl });
  await recordAuditEvent({
    scope,
    action: "website_watch.seo_baseline_reset",
    entityType: "sync",
    entityId: null,
    metadata: { site_url: site.siteUrl, deleted_count: deleted.deletedCount },
  });
  return { ok: true, deletedCount: deleted.deletedCount };
}

export async function listCompetitiveAnalyses(scope: SeoTenantScope) {
  const { competitiveAnalyses } = await getSeoCollections();
  const rows = await competitiveAnalyses.find({ user_id: scope.userId }).sort({ created_at: -1 }).limit(25).toArray();
  return rows.map(({ _id: _mongoId, ...row }) => row);
}

export async function generateInsights(scope: SeoTenantScope) {
  const { integrations, insights, metricSnapshots } = await getSeoCollections();
  try {
    const openAi = await integrations.findOne({ user_id: scope.userId, provider: "openai", encrypted_secret: { $ne: null } });
    const hasEnvOpenAiKey = Boolean(asString(process.env.OPENAI_API_KEY));

    if (!openAi && !hasEnvOpenAiKey) {
      throw new Error("Connect a ChatGPT/OpenAI token before generating AI insights.");
    }

    const apiKey = getConfiguredOpenAiApiKey(openAi);

    const [integrationRows, metricRows] = await Promise.all([
      integrations.find({ user_id: scope.userId }).sort({ created_at: 1 }).toArray(),
      metricSnapshots.find({ user_id: scope.userId }).sort({ captured_at: -1 }).limit(50).toArray(),
    ]);
    const payload = sanitizeForAiPayload({
      integrations: integrationRows.map((item) => ({
        provider: item.provider,
        display_name: item.display_name,
        status: item.status,
        config: item.config_json,
        last_tested_at: item.last_tested_at,
        last_error: item.last_error,
      })),
      metricSnapshots: metricRows.map(({ _id: _mongoId, ...row }) => row),
    }) as Record<string, unknown>;

    const result = await fetchJson("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: insightResponseFormat,
        messages: buildInsightPrompt(payload),
      }),
    });

    if (!result.ok) {
      throw new Error(`OpenAI insight generation failed with HTTP ${result.status}.`);
    }

    const body = result.body as { choices?: Array<{ message?: { content?: string; refusal?: string } }> };
    const refusal = body.choices?.[0]?.message?.refusal;
    if (refusal) {
      throw new Error("OpenAI refused to generate insights for the supplied payload.");
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty insight response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("OpenAI returned non-JSON insight content.");
    }

    const generated = normalizeInsights(extractInsightRows(parsed), scope).map((insight) => ({
      ...insight,
      source_payload_json: payload,
    }));

    if (generated.length) {
      await insights.insertMany(generated);
      await recordAuditEvent({
        scope,
        action: "insights.generated",
        entityType: "insight",
        entityId: null,
        metadata: { count: generated.length, model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini" },
      });
    }

    return generated;
  } catch (error) {
    await recordAuditEvent({
      scope,
      action: "insights.generate_failed",
      entityType: "insight",
      entityId: null,
      metadata: {
        model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini",
        error: error instanceof Error ? error.message : "Unknown insight generation error.",
      },
    });
    throw error;
  }
}

export async function generateCompetitiveAnalysis(scope: SeoTenantScope, rawPayload: CompetitiveAnalysisPayload) {
  const { integrations, competitiveAnalyses } = await getSeoCollections();
  try {
    const openAi = await integrations.findOne({ user_id: scope.userId, provider: "openai", encrypted_secret: { $ne: null } });
    const hasEnvOpenAiKey = Boolean(asString(process.env.OPENAI_API_KEY));
    const enrichedPayload = await autofillCompetitiveBrief(rawPayload, openAi, hasEnvOpenAiKey);
    const payload = validateCompetitiveAnalysisPayload(enrichedPayload);
    const discoveredCompetitors = await discoverCompetitors(payload);
    const competitors = dedupeCompetitors([...payload.competitors, ...discoveredCompetitors]);
    const crawlEvidence = await Promise.all([
      crawlWebsite({ site_role: "client", name: payload.clientName, url: payload.websiteUrl }),
      ...competitors.map((competitor) =>
        crawlWebsite({ site_role: "competitor", name: competitor.name, url: competitor.url })
      ),
    ]);
    const deterministic = deterministicCompetitiveAnalysis({ ...payload, competitors }, crawlEvidence);
    const integrationRows = await integrations.find({ user_id: scope.userId }).sort({ created_at: 1 }).toArray();
    const analysisInput = sanitizeForAiPayload({
      ...payload,
      competitors,
      deterministicAnalysis: deterministic,
      connectorStatus: integrationRows.map((item) => ({
        provider: item.provider,
        status: item.status,
        config: item.config_json,
        last_error: item.last_error,
      })),
    }) as Record<string, unknown>;

    let parsed: unknown = deterministic;
    if (openAi || hasEnvOpenAiKey) {
      try {
        const apiKey = getAvailableOpenAiApiKey(openAi);
        const result = await fetchJson("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini",
            temperature: 0.25,
            response_format: competitiveAnalysisResponseFormat,
            messages: buildCompetitiveAnalysisPrompt(analysisInput),
          }),
        });

        if (!result.ok) {
          throw new Error(`OpenAI competitive analysis failed with HTTP ${result.status}.`);
        }

        const body = result.body as { choices?: Array<{ message?: { content?: string; refusal?: string } }> };
        const refusal = body.choices?.[0]?.message?.refusal;
        if (refusal) {
          throw new Error("OpenAI refused to generate competitive analysis for the supplied payload.");
        }

        const content = body.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("OpenAI returned an empty competitive analysis response.");
        }

        parsed = {
          ...deterministic,
          ...JSON.parse(content),
          missing_from_client: deterministic.missing_from_client,
          competitor_only_patterns: deterministic.competitor_only_patterns,
          shared_patterns: deterministic.shared_patterns,
          client_strengths: deterministic.client_strengths,
          crawl_evidence: deterministic.crawl_evidence,
          top_performers: deterministic.top_performers,
        };
      } catch (error) {
        parsed = {
          ...deterministic,
          assumptions: [
            ...deterministic.assumptions,
            `Optional OpenAI summary was skipped: ${error instanceof Error ? error.message : "unknown error"}`,
          ],
        };
      }
    }

    const analysis = normalizeCompetitiveAnalysis(parsed, { ...payload, competitors }, scope);
    analysis.source_payload_json = analysisInput;
    await competitiveAnalyses.insertOne(analysis);
    await recordAuditEvent({
      scope,
      action: "competitive_analysis.generated",
      entityType: "insight",
      entityId: analysis.id,
      metadata: {
        industry: analysis.industry,
        competitor_count: analysis.competitors.length,
        crawled_site_count: analysis.crawl_evidence.length,
        openai_used: Boolean(openAi || hasEnvOpenAiKey),
      },
    });

    return analysis;
  } catch (error) {
    await recordAuditEvent({
      scope,
      action: "competitive_analysis.generate_failed",
      entityType: "insight",
      entityId: null,
      metadata: {
        model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini",
        error: error instanceof Error ? error.message : "Unknown competitive analysis error.",
      },
    });
    throw error;
  }
}

function ga4DateToIso(rawDate: string) {
  if (!/^\d{8}$/.test(rawDate)) {
    return nowIso();
  }

  return `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T00:00:00.000Z`;
}

function parseMetricValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ga4RowsToSnapshots({
  rows,
  scope,
  propertyId,
  capturedAt,
}: {
  rows: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  scope: SeoTenantScope;
  propertyId: string;
  capturedAt: string;
}): SeoMetricSnapshot[] {
  const metricNames = ["active_users", "sessions", "page_views", "event_count"];

  return rows.flatMap((row) => {
    const ga4Date = asString(row.dimensionValues?.[0]?.value);
    const rowCapturedAt = ga4DateToIso(ga4Date);

    return metricNames.map((metricName, index) => ({
      id: randomUUID(),
      user_id: scope.userId,
      provider: "ga4" as const,
      page_url: null,
      metric_name: metricName,
      metric_value: parseMetricValue(row.metricValues?.[index]?.value),
      dimensions_json: {
        date: ga4Date,
        property_id: propertyId,
        sync_captured_at: capturedAt,
      },
      captured_at: rowCapturedAt,
      created_at: capturedAt,
    }));
  });
}

function ga4PageRowsToSnapshots({
  rows,
  scope,
  propertyId,
  capturedAt,
}: {
  rows: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  scope: SeoTenantScope;
  propertyId: string;
  capturedAt: string;
}): SeoMetricSnapshot[] {
  return rows.map((row) => {
    const pagePath = asString(row.dimensionValues?.[0]?.value) || "/";
    return {
      id: randomUUID(),
      user_id: scope.userId,
      provider: "ga4" as const,
      page_url: pagePath,
      metric_name: "top_page_views",
      metric_value: parseMetricValue(row.metricValues?.[0]?.value),
      dimensions_json: {
        page_path: pagePath,
        active_users: parseMetricValue(row.metricValues?.[1]?.value),
        property_id: propertyId,
        sync_captured_at: capturedAt,
      },
      captured_at: capturedAt,
      created_at: capturedAt,
    };
  });
}

export async function syncGa4Metrics(scope: SeoTenantScope): Promise<SeoMetricSnapshot[]> {
  const { integrations, metricSnapshots } = await getSeoCollections();
  const integration = await integrations.findOne({ user_id: scope.userId, provider: "ga4" });

  if (!integration) {
    throw new Error("Connect GA4 before syncing metrics.");
  }

  const propertyId = normalizeGa4PropertyId(integration.config_json?.propertyId);
  const accessToken = await getGa4AccessToken(integration);
  const capturedAt = nowIso();
  const baseUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const commonHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const [trendResult, pageResult] = await Promise.all([
    fetchJson(baseUrl, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "eventCount" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 32,
      }),
    }),
    fetchJson(baseUrl, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 8,
      }),
    }),
  ]);

  if (!trendResult.ok) {
    throw new Error(`GA4 trend sync failed with HTTP ${trendResult.status}.`);
  }

  if (!pageResult.ok) {
    throw new Error(`GA4 top-page sync failed with HTTP ${pageResult.status}.`);
  }

  const trendRows =
    trendResult.body && typeof trendResult.body === "object" && Array.isArray((trendResult.body as { rows?: unknown }).rows)
      ? ((trendResult.body as { rows: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }).rows)
      : [];
  const pageRows =
    pageResult.body && typeof pageResult.body === "object" && Array.isArray((pageResult.body as { rows?: unknown }).rows)
      ? ((pageResult.body as { rows: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }).rows)
      : [];
  const snapshots = [
    ...ga4RowsToSnapshots({ rows: trendRows, scope, propertyId, capturedAt }),
    ...ga4PageRowsToSnapshots({ rows: pageRows, scope, propertyId, capturedAt }),
  ];

  await metricSnapshots.deleteMany({
    user_id: scope.userId,
    provider: "ga4",
    metric_name: { $in: ["active_users", "sessions", "page_views", "event_count", "top_page_views"] },
  });

  if (snapshots.length) {
    await metricSnapshots.insertMany(snapshots);
  }

  await recordAuditEvent({
    scope,
    action: "ga4.metrics_synced",
    entityType: "sync",
    entityId: integration.id,
    metadata: { property_id: propertyId, snapshot_count: snapshots.length },
  });

  const updated: SeoIntegration = {
    ...integration,
    status: "connected",
    last_tested_at: capturedAt,
    last_error: null,
    updated_at: capturedAt,
  };
  await integrations.replaceOne({ id: integration.id, user_id: scope.userId }, updated);

  return snapshots;
}

export async function runScheduledSeoSync() {
  await bootstrapSeoStorage();
  return {
    ok: true,
    message: "Scheduled sync scaffold is ready. GA4/GTM OAuth sync is still pending credentials.",
  };
}
