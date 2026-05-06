import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";
import { ensureSeoIndexes, getSeoCollections } from "./db";
import type {
  SeoClient,
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
const HTTP_TIMEOUT_MS = 7000;

type IntegrationPayload = {
  integrationId?: string;
  provider?: string;
  display_name?: string;
  config?: Record<string, unknown>;
};

type SecretMap = Record<string, string>;

type ClientPayload = {
  id?: string;
  name?: string;
  notes?: string;
};

type AuditPayload = {
  scope: SeoTenantScope;
  action: string;
  entityType: "client" | "integration" | "insight" | "sync" | "system";
  entityId?: string | null;
  metadata?: Record<string, unknown>;
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

function stripSecrets(inputConfig: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {};
  const secrets: SecretMap = {};

  for (const [key, value] of Object.entries(inputConfig)) {
    if (SECRET_FIELDS.has(key)) {
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

  if (provider === "openai" && !asString(config.apiKey) && !payload.integrationId) {
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

function parseSecretMap(integration: SeoIntegration): SecretMap {
  const raw = decryptSecret(integration.encrypted_secret);
  return raw ? (JSON.parse(raw) as SecretMap) : {};
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
  const secrets = parseSecretMap(integration);
  if (!secrets.accessToken && !secrets.refreshToken && !secrets.clientSecret) {
    throw new Error("GA4 credentials not configured; saved property metadata only.");
  }

  throw new Error("GA4 OAuth/Data API sync is not configured in this MVP.");
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
      content: `Given this data:\n${JSON.stringify(payload)}\n\nGenerate insights as an array of objects:\n[\n  {\n    "title": "Short specific finding",\n    "description": "What is happening",\n    "impact": "Why it matters",\n    "recommendation": "Specific next action",\n    "priority": "low | medium | high",\n    "confidence_score": 0-100,\n    "source_provider": "ga4 | gtm | hotjar | mcp | mixed"\n  }\n]\n\nRules:\n- Do not invent data.\n- If evidence is weak, lower confidence.\n- Prefer specific recommendations over generic SEO advice.\n- Correlate sources when possible.\n- Mention missing data as setup gaps.\n- Return valid JSON only.`,
    },
  ];
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

export async function generateInsights(scope: SeoTenantScope) {
  const { integrations, insights, metricSnapshots } = await getSeoCollections();
  const openAi = await integrations.findOne({ user_id: scope.userId, provider: "openai", encrypted_secret: { $ne: null } });

  if (!openAi) {
    throw new Error("Connect a ChatGPT/OpenAI token before generating AI insights.");
  }

  const secrets = parseSecretMap(openAi);
  const apiKey = secrets.apiKey || secrets.token;

  if (!apiKey) {
    throw new Error("Stored OpenAI token is unavailable.");
  }

  const [integrationRows, metricRows] = await Promise.all([
    integrations.find({ user_id: scope.userId }).sort({ created_at: 1 }).toArray(),
    metricSnapshots.find({ user_id: scope.userId }).sort({ captured_at: -1 }).limit(50).toArray(),
  ]);
  const payload = {
    integrations: integrationRows.map((item) => ({
      provider: item.provider,
      display_name: item.display_name,
      status: item.status,
      config: item.config_json,
      last_tested_at: item.last_tested_at,
      last_error: item.last_error,
    })),
    metricSnapshots: metricRows.map(({ _id: _mongoId, ...row }) => row),
  };

  const result = await fetchJson("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: buildInsightPrompt(payload),
    }),
  });

  if (!result.ok) {
    throw new Error(`OpenAI insight generation failed with HTTP ${result.status}.`);
  }

  const body = result.body as { choices?: Array<{ message?: { content?: string } }> };
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

  const generated = normalizeInsights(parsed, scope).map((insight) => ({
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
}

export async function syncGa4Metrics(_scope: SeoTenantScope): Promise<SeoMetricSnapshot[]> {
  throw new Error("GA4 credentials not configured; sync service is stubbed for this MVP.");
}

export async function runScheduledSeoSync() {
  await bootstrapSeoStorage();
  return {
    ok: true,
    message: "Scheduled sync scaffold is ready. GA4/GTM OAuth sync is still pending credentials.",
  };
}
