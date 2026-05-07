import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../lib/seo/auth";
import { decryptSecret, encryptSecret } from "../lib/seo/crypto";
import { rateLimit, resetRateLimitsForTests } from "../lib/seo/rate-limit";
import { normalizeCompetitiveAnalysis, normalizeInsights, safeIntegration, validateHttpUrl } from "../lib/seo/service";
import { normalizeClientId } from "../lib/seo/tenant";

process.env.SEO_SECRET_ENCRYPTION_KEY =
  process.env.SEO_SECRET_ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("encryption utility does not return plaintext", () => {
  const encrypted = encryptSecret("sk-secret-token");

  assert.notEqual(JSON.stringify(encrypted), "sk-secret-token");
  assert.equal(decryptSecret(encrypted), "sk-secret-token");
});

test("safe integration strips encrypted secrets", () => {
  const safe = safeIntegration({
    id: "int_1",
    user_id: "local-user",
    provider: "openai",
    display_name: "OpenAI",
    status: "disconnected",
    config_json: {},
    encrypted_secret: {
      v: 1,
      alg: "aes-256-gcm",
      iv: "hidden",
      tag: "hidden",
      ciphertext: "hidden",
    },
    last_tested_at: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  assert.equal(safe.has_secret, true);
  assert.equal(Object.hasOwn(safe, "encrypted_secret"), false);
});

test("safe integration redacts secret-like config fields", () => {
  const safe = safeIntegration({
    id: "int_2",
    user_id: "local-user",
    provider: "openai",
    display_name: "OpenAI",
    status: "disconnected",
    config_json: {
      displayName: "OpenAI",
      api_key: "sk-leaked-token",
      nested: { client_secret: "nested-secret", publicId: "visible" },
    },
    encrypted_secret: null,
    last_tested_at: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  assert.equal(safe.config_json.api_key, "[redacted]");
  assert.deepEqual(safe.config_json.nested, { client_secret: "[redacted]", publicId: "visible" });
});

test("insight normalization validates JSON array shape", () => {
  assert.throws(() => normalizeInsights({ title: "not an array" }), /JSON array/);
  assert.throws(() => normalizeInsights([{ title: "Missing required fields" }]), /missing required fields/);

  const [insight] = normalizeInsights([
    {
      title: "Missing GA4",
      description: "GA4 is not connected.",
      impact: "Traffic data is unavailable.",
      recommendation: "Connect GA4.",
      priority: "high",
      confidence_score: 92,
      source_provider: "ga4",
    },
  ]);

  assert.equal(insight.priority, "high");
  assert.equal(insight.confidence_score, 92);
});

test("competitive analysis normalization validates required JSON shape", () => {
  const payload = {
    clientName: "Acme Health",
    websiteUrl: "https://example.com",
    industry: "Healthcare SaaS",
    market: "US",
    targetAudience: "Clinic operators",
    competitors: [{ name: "OtherCo", url: null }],
    targetKeywords: ["patient engagement software"],
    notes: "",
  };

  assert.throws(
    () => normalizeCompetitiveAnalysis({ summary: "Missing fields" }, payload, { userId: "acme-health" }),
    /missing summary/
  );

  const analysis = normalizeCompetitiveAnalysis(
    {
      summary: "Competitors appear to cluster around operational efficiency.",
      positioning: "Lead with measurable workflow gains and implementation clarity.",
      competitor_themes: ["Workflow automation"],
      content_gaps: ["Comparison pages"],
      keyword_opportunities: ["patient engagement platform"],
      recommendations: [{ title: "Publish a comparison hub", rationale: "It gives buyers an evaluation path.", priority: "high" }],
      assumptions: ["No live ranking data was provided."],
      confidence_score: 71,
    },
    payload,
    { userId: "acme-health" }
  );

  assert.equal(analysis.user_id, "acme-health");
  assert.equal(analysis.recommendations[0].priority, "high");
  assert.equal(analysis.confidence_score, 71);
});

test("MCP connector rejects non-http URLs", () => {
  assert.throws(() => validateHttpUrl("stdio://local-tool"), /http or https/);
  assert.equal(validateHttpUrl("https://mcp.example.com").protocol, "https:");
});

test("tenant client ids are validated", () => {
  assert.equal(normalizeClientId("acme-client_1"), "acme-client_1");
  assert.equal(normalizeClientId(""), "demo-client");
  assert.throws(() => normalizeClientId("../other-client"), /Client id/);
});

test("rate limiter blocks after configured limit", () => {
  resetRateLimitsForTests();
  rateLimit("test-key", 2, 60_000);
  rateLimit("test-key", 2, 60_000);
  assert.throws(() => rateLimit("test-key", 2, 60_000), /Rate limit exceeded/);
});

test("app auth password hashing verifies without storing plaintext", () => {
  const result = hashPassword("secret-password");

  assert.notEqual(result.hash, "secret-password");
  assert.equal(verifyPassword("secret-password", result.salt, result.hash), true);
  assert.equal(verifyPassword("wrong-password", result.salt, result.hash), false);
});
