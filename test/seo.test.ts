import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { auditBlogDraft, cleanExtractedText, splitFactualClaims, type VastSourceResult } from "../lib/blog-audit";
import { readBlogAuditFormPayload } from "../lib/blog-upload";
import { hashPassword, verifyPassword } from "../lib/seo/auth";
import { decryptSecret, encryptSecret } from "../lib/seo/crypto";
import { rateLimit, resetRateLimitsForTests } from "../lib/seo/rate-limit";
import {
  compareCompetitiveWebsites,
  extractWebsiteFacts,
  mergeCompetitiveBriefAutofill,
  normalizeCompetitiveAnalysis,
  normalizeInsights,
  parseCompetitors,
  safeIntegration,
  validateCompetitiveAnalysisPayload,
  validateHttpUrl,
} from "../lib/seo/service";
import { normalizeClientId } from "../lib/seo/tenant";

process.env.SEO_SECRET_ENCRYPTION_KEY =
  process.env.SEO_SECRET_ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const auditSourceFixture: VastSourceResult[] = [
  {
    id: "docs-llms",
    name: "Vast docs knowledge",
    url: "https://docs.vast.ai/llms.txt",
    kind: "docs",
    required: true,
    status: "ok",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    text: "Vast.ai documentation includes creating GPU instances, SSH keys, templates, API keys, and environment variables.",
  },
  {
    id: "site-llms-full",
    name: "Vast full site knowledge",
    url: "https://vast.ai/llms-full.txt",
    kind: "site",
    required: true,
    status: "ok",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    text: "Vast.ai is a GPU cloud platform offering on-demand access to GPUs from data centers and independent hosts worldwide.",
  },
  {
    id: "pricing-api",
    name: "Live Vast inventory and pricing",
    url: "https://vast.ai/api/vast-pricing",
    kind: "inventory",
    required: true,
    timeSensitive: true,
    status: "ok",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    text: "Vast live pricing inventory rtx 4090 $0.180/hr minimum $0.300/hr median 1200 offers. h100 $0.790/hr minimum 400 offers.",
  },
  {
    id: "press-kit",
    name: "Vast press kit",
    url: "https://vast.ai/press-kit",
    kind: "brand",
    required: true,
    status: "ok",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    text: "Vast.ai is an AI compute platform connecting developers with high-performance GPU cloud resources. Founded in 2018.",
  },
  {
    id: "x-official",
    name: "Official X public messaging",
    url: "https://x.com/vast_ai",
    kind: "social",
    required: false,
    status: "ok",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    text: "Vast.ai shares product updates and public messaging through the official X account.",
  },
  {
    id: "linkedin-approved-feed",
    name: "Approved LinkedIn feed",
    url: "",
    kind: "social",
    required: false,
    approvedFeedOnly: true,
    status: "blocked",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    text: "",
    error: "LinkedIn is available only through an approved feed.",
  },
];

test("blog audit extracts clean Markdown claims", () => {
  const text = cleanExtractedText(
    "# How to Run Qwen\n\nVast.ai offers on-demand GPU instances. Run `vastai search offers` after checking pricing.",
    "text/plain",
    "markdown"
  );

  assert.doesNotMatch(text, /^#/);
  assert.ok(splitFactualClaims(text).some((claim) => claim.includes("Vast.ai offers on-demand GPU instances")));
});

test("blog audit marks observed current claims and stale pricing risks", async () => {
  const report = await auditBlogDraft(
    {
      title: "How to Run Qwen on Vast.ai",
      format: "markdown",
      content:
        "# How to Run Qwen\n\nVast.ai offers on-demand access to GPUs from data centers and independent hosts worldwide. RTX 4090 pricing can start around $0.18/hr on Vast.ai.",
    },
    { sources: auditSourceFixture }
  );

  assert.equal(report.claims[0].status, "PASS");
  assert.equal(report.claims[1].status, "STALE_RISK");
  assert.ok(report.claims[1].evidence.includes("https://vast.ai/api/vast-pricing"));
  assert.equal(report.recommendation, "PASS_WITH_EDITS");
});

test("blog audit blocks unsupported guarantees before publication", async () => {
  const report = await auditBlogDraft(
    {
      title: "Vast Blog Draft",
      format: "plain_text",
      content: "Vast AI always has the cheapest H100 GPUs available with 100% uptime for every workload.",
    },
    { sources: auditSourceFixture }
  );

  assert.equal(report.recommendation, "DO_NOT_PUBLISH");
  assert.ok(report.claims.some((claim) => claim.status === "FAIL"));
  const failedClaim = report.claims.find((claim) => claim.status === "FAIL");
  assert.ok(failedClaim);
  assert.doesNotMatch(failedClaim.suggestedRewrite, /\b(100%|always|cheapest|uptime)\b/i);
  assert.match(failedClaim.suggestedRewrite, /live Vast inventory/i);
  assert.ok(report.brandFindings.some((finding) => finding.severity === "high"));
  assert.ok(report.missingEvidence.some((item) => item.includes("LinkedIn")));
});

test("blog audit uses one performant external evidence search for unsupported claims", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  let requestBody: Record<string, any> | null = null;
  let requestCount = 0;

  process.env.OPENAI_API_KEY = "test-openai-key";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestCount += 1;
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    requestBody = JSON.parse(String(init?.body || "{}"));

    return new Response(
      JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  results: [
                    {
                      id: "c1",
                      claim: "NVIDIA was founded in 1993 as a graphics company.",
                      status: "PASS",
                      reason: "NVIDIA timeline supports the 1993 founding claim.",
                      evidence: ["https://www.nvidia.com/en-us/about-nvidia/corporate-timeline/"],
                      suggestedRewrite: "No rewrite required.",
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const report = await auditBlogDraft(
      {
        title: "External evidence test",
        format: "plain_text",
        content: "NVIDIA was founded in 1993 as a graphics company.",
      },
      { sources: auditSourceFixture }
    );

    assert.equal(requestCount, 1);
    assert.equal(requestBody?.tool_choice, "required");
    assert.equal(requestBody?.tools?.[0]?.type, "web_search");
    assert.equal(requestBody?.tools?.[0]?.search_context_size, "low");
    assert.ok(String(requestBody?.input || "").length < 2200);
    assert.equal(report.claims[0].status, "PASS");
    assert.equal(report.claims[0].evidence[0], "https://www.nvidia.com/en-us/about-nvidia/corporate-timeline/");
    assert.match(report.claims[0].reason, /External evidence check/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  }
});

test("blog audit form accepts ZIP uploads with draft files", async () => {
  const zip = new JSZip();
  zip.file(
    "drafts/qwen-vast.md",
    "# How to Run Qwen on Vast.ai\n\nVast.ai offers on-demand GPU instances for AI workloads."
  );
  zip.file("__MACOSX/._ignored.txt", "ignored");
  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  const form = new FormData();

  form.set("file", new File([zipBuffer], "vast-blog-draft.zip", { type: "application/zip" }));
  form.set("content", "This pasted fallback should not replace the uploaded file.");

  const payload = await readBlogAuditFormPayload(form);

  assert.equal(payload.format, "plain_text");
  assert.equal(payload.title, "vast-blog-draft");
  assert.match(payload.content || "", /Source file: drafts\/qwen-vast\.md/);
  assert.match(payload.content || "", /Vast\.ai offers on-demand GPU instances/);
  assert.doesNotMatch(payload.content || "", /pasted fallback/);
});

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
    contextAssumptions: [],
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

test("competitive payload accepts company name only", () => {
  const payload = validateCompetitiveAnalysisPayload({ clientName: "Acme Health" });

  assert.equal(payload.clientName, "Acme Health");
  assert.equal(payload.industry, "Unspecified industry");
  assert.equal(payload.websiteUrl, null);
  assert.deepEqual(payload.competitors, []);
  assert.ok(payload.contextAssumptions.includes("Industry was not supplied directly."));
});

test("competitive brief autofill preserves user values and adds inferred context", () => {
  const payload = mergeCompetitiveBriefAutofill(
    { clientName: "Acme Health", websiteUrl: "https://client.example" },
    {
      websiteUrl: "https://wrong.example",
      industry: "Healthcare SaaS",
      market: "US clinics",
      targetAudience: "Practice operators",
      competitors: [
        { name: "OtherCo", url: "https://other.example/" },
        { name: "Bad URL", url: "not-a-url" },
      ],
      targetKeywords: ["patient engagement software", "clinic automation"],
      notes: "Likely sells workflow software.",
      assumptions: ["Competitors are inferred from company category."],
    }
  );

  assert.equal(payload.websiteUrl, "https://client.example");
  assert.equal(payload.industry, "Healthcare SaaS");
  assert.match(payload.competitors || "", /OtherCo https:\/\/other.example/);
  assert.doesNotMatch(payload.competitors || "", /not-a-url/);
  assert.match(payload.targetKeywords || "", /patient engagement software/);
  assert.ok(payload.contextAssumptions?.some((assumption) => assumption.includes("auto-filled")));
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
