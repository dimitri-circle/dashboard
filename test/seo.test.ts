import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../lib/seo/auth";
import { decryptSecret, encryptSecret } from "../lib/seo/crypto";
import { rateLimit, resetRateLimitsForTests } from "../lib/seo/rate-limit";
import {
  compareCompetitiveWebsites,
  extractWebsiteFacts,
  normalizeCompetitiveAnalysis,
  normalizeInsights,
  parseCompetitors,
  safeIntegration,
  validateHttpUrl,
} from "../lib/seo/service";
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

test("competitor parsing handles names, URLs, and blanks", () => {
  assert.deepEqual(parseCompetitors("OtherCo https://other.example\n\nhttps://solo.example, Plain Co"), [
    { name: "OtherCo", url: "https://other.example" },
    { name: "solo.example", url: "https://solo.example" },
    { name: "Plain Co", url: null },
  ]);
});

test("website fact extraction detects visible features", () => {
  const page = extractWebsiteFacts(
    `<!doctype html>
      <html>
        <head>
          <title>Acme Pricing</title>
          <meta name="description" content="Book a demo for pricing and plans." />
          <script type="application/ld+json">{"@type":"FAQPage"}</script>
        </head>
        <body>
          <header><nav><a href="/pricing">Pricing</a><a href="/case-studies">Case Studies</a></nav></header>
          <h1>Simple pricing plans</h1>
          <h2>Customer stories</h2>
          <a href="/demo">Book a demo</a>
        </body>
      </html>`,
    "https://example.com/pricing"
  );

  const featureIds = page.features.map((feature) => feature.feature);
  assert.equal(page.title, "Acme Pricing");
  assert.ok(featureIds.includes("pricing_page"));
  assert.ok(featureIds.includes("case_studies"));
  assert.ok(featureIds.includes("demo_cta"));
  assert.ok(featureIds.includes("structured_schema"));
});

test("competitive website comparison reports competitor-only gaps", () => {
  const comparison = compareCompetitiveWebsites([
    {
      site_role: "client",
      name: "Client",
      url: "https://client.example",
      status: "success",
      feature_count: 1,
      pages: [],
      features: [{ feature: "blog_resources", label: "Blog or resource hub", urls: ["https://client.example/blog"] }],
      errors: [],
    },
    {
      site_role: "competitor",
      name: "Competitor",
      url: "https://competitor.example",
      status: "success",
      feature_count: 2,
      pages: [],
      features: [
        { feature: "blog_resources", label: "Blog or resource hub", urls: ["https://competitor.example/blog"] },
        { feature: "pricing_page", label: "Pricing page", urls: ["https://competitor.example/pricing"] },
      ],
      errors: [],
    },
  ]);

  assert.equal(comparison.missing_from_client[0].feature, "pricing_page");
  assert.equal(comparison.shared_patterns[0].feature, "blog_resources");
  assert.equal(comparison.top_performers[0].name, "Competitor");
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
