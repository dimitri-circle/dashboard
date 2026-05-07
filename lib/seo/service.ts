import crypto, { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";
import { ensureSeoIndexes, getSeoCollections } from "./db";
import type {
  SeoClient,
  SeoCompetitiveAnalysis,
  SafeSeoIntegration,
  SeoInsight,
  SeoIntegration,
  SeoMetricSnapshot,
  SeoPriority,
  SeoProvider,
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
        "recommendations",
        "assumptions",
        "confidence_score",
      ],
    },
  },
};

export function nowIso() {
  return new Date().toISOString();
}

export async function bootstrapSeoStorage() {
  await ensureSeoIndexes();
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

  const id = normalizeClientId(asString(payload.id) || slugifyClientId(name));
  const existing = await clients.findOne({ id });

  if (existing) {
    throw new Error("A client with this id already exists.");
  }

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

function parseCompetitors(rawValue: unknown) {
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

function validateCompetitiveAnalysisPayload(payload: CompetitiveAnalysisPayload) {
  const clientName = asString(payload.clientName).slice(0, 140);
  const industry = asString(payload.industry).slice(0, 140);
  const websiteUrl = asString(payload.websiteUrl);
  const market = asString(payload.market).slice(0, 140);
  const targetAudience = asString(payload.targetAudience).slice(0, 240);
  const competitors = parseCompetitors(payload.competitors);
  const targetKeywords = parseLines(payload.targetKeywords);
  const notes = asString(payload.notes).slice(0, 1000);

  if (!clientName) {
    throw new Error("Client name is required for competitive analysis.");
  }

  if (!industry) {
    throw new Error("Industry is required for competitive analysis.");
  }

  if (websiteUrl) {
    validateHttpUrl(websiteUrl, "websiteUrl");
  }

  return {
    clientName,
    industry,
    websiteUrl: websiteUrl || null,
    market: market || null,
    targetAudience: targetAudience || null,
    competitors,
    targetKeywords,
    notes,
  };
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
      content: `Given this client and market data:\n${JSON.stringify(payload)}\n\nGenerate one competitive analysis JSON object with this exact shape:\n{\n  "summary": "Concise competitive landscape summary",\n  "positioning": "How the client should be positioned against alternatives",\n  "competitor_themes": ["Theme observed or inferred from provided competitor names/data"],\n  "content_gaps": ["Content gap or missing asset"],\n  "keyword_opportunities": ["Keyword or topic cluster opportunity"],\n  "recommendations": [\n    {\n      "title": "Specific action",\n      "rationale": "Why this matters",\n      "priority": "low | medium | high"\n    }\n  ],\n  "assumptions": ["Assumption or missing-data caveat"],\n  "confidence_score": 0-100\n}\n\nRules:\n- Use only provided data and stored connector status.\n- Do not invent live competitor rankings or market share.\n- If evidence is weak, add caveats to assumptions and lower confidence.\n- Prefer specific SEO, content, and positioning actions.\n- Return valid JSON only.`,
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

export async function listCompetitiveAnalyses(scope: SeoTenantScope) {
  const { competitiveAnalyses } = await getSeoCollections();
  const rows = await competitiveAnalyses.find({ user_id: scope.userId }).sort({ created_at: -1 }).limit(25).toArray();
  return rows.map(({ _id: _mongoId, ...row }) => row);
}

export async function generateInsights(scope: SeoTenantScope) {
  const { integrations, insights, metricSnapshots } = await getSeoCollections();
  try {
    const openAi = await integrations.findOne({ user_id: scope.userId, provider: "openai", encrypted_secret: { $ne: null } });

    if (!openAi) {
      throw new Error("Connect a ChatGPT/OpenAI token before generating AI insights.");
    }

    const apiKey = getOpenAiApiKey(openAi);

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

    if (!openAi) {
      throw new Error("Connect a ChatGPT/OpenAI token before generating competitive analysis.");
    }

    const payload = validateCompetitiveAnalysisPayload(rawPayload);
    const integrationRows = await integrations.find({ user_id: scope.userId }).sort({ created_at: 1 }).toArray();
    const analysisInput = sanitizeForAiPayload({
      ...payload,
      connectorStatus: integrationRows.map((item) => ({
        provider: item.provider,
        status: item.status,
        config: item.config_json,
        last_error: item.last_error,
      })),
    }) as Record<string, unknown>;

    const result = await fetchJson("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAiApiKey(openAi)}`,
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("OpenAI returned non-JSON competitive analysis content.");
    }

    const analysis = normalizeCompetitiveAnalysis(parsed, payload, scope);
    analysis.source_payload_json = analysisInput;
    await competitiveAnalyses.insertOne(analysis);
    await recordAuditEvent({
      scope,
      action: "competitive_analysis.generated",
      entityType: "insight",
      entityId: analysis.id,
      metadata: { industry: analysis.industry, competitor_count: analysis.competitors.length },
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
