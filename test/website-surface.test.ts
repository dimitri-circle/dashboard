import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSurfacePages,
  normalizeWebsiteSurfaceInput,
  validatePublicWebsiteUrl,
} from "../lib/seo/website-surface";
import { runSeoChangeTracker } from "../lib/seo/seo-change-tracker";

test("website surface check rejects local and private targets", () => {
  assert.throws(() => validatePublicWebsiteUrl("http://localhost:3000"), /local, private/);
  assert.throws(() => validatePublicWebsiteUrl("http://127.0.0.1:3000"), /local, private/);
  assert.throws(() => validatePublicWebsiteUrl("http://10.0.0.4"), /local, private/);
  assert.throws(() => validatePublicWebsiteUrl("ftp://example.com"), /http or https/);
});

test("website surface pages stay on one public origin", () => {
  assert.deepEqual(normalizeSurfacePages("https://example.com", ["/pricing", "https://example.com/blog#top"]), [
    "https://example.com/",
    "https://example.com/pricing",
    "https://example.com/blog",
  ]);

  assert.throws(
    () => normalizeSurfacePages("https://example.com", ["https://other.example/pricing"]),
    /same site origin/
  );
});

test("website surface input accepts comma and newline lists", () => {
  const input = normalizeWebsiteSurfaceInput({
    siteUrl: " https://example.com ",
    pages: "/pricing,\n/blog",
    expectedText: "Example\nPricing",
  });

  assert.equal(input.siteUrl, "https://example.com");
  assert.deepEqual(input.pages, ["/pricing", "/blog"]);
  assert.deepEqual(input.expectedText, ["Example", "Pricing"]);
});

test("seo change tracker captures baseline then reports metadata and copy changes", async () => {
  const originalFetch = globalThis.fetch;
  let html = `<!doctype html>
    <html>
      <head>
        <title>Old title</title>
        <meta name="description" content="Old description for search previews.">
        <link rel="canonical" href="https://example.com/">
        <meta property="og:title" content="Old title">
        <meta property="og:description" content="Old social description.">
      </head>
      <body><h1>Old H1</h1><p>Original body copy for the tracked page.</p></body>
    </html>`;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html",
      },
    });
  }) as typeof fetch;

  try {
    const baselineRun = await runSeoChangeTracker({ siteUrl: "https://example.com", pages: ["/"] });
    assert.equal(baselineRun.status, "baseline");
    assert.equal(baselineRun.summary.pagesChecked, 1);
    assert.equal(baselineRun.summary.changedPages, 0);
    assert.equal(baselineRun.baseline.pages[0].title, "Old title");

    html = `<!doctype html>
      <html>
        <head>
          <title>New title</title>
          <meta name="description" content="New description for search previews.">
          <link rel="canonical" href="https://example.com/">
          <meta property="og:title" content="New title">
          <meta property="og:description" content="New social description.">
        </head>
        <body><h1>Old H1</h1><p>Updated body copy for the tracked page with new launch language.</p></body>
      </html>`;

    const changedRun = await runSeoChangeTracker({
      siteUrl: "https://example.com",
      pages: ["/"],
      baseline: baselineRun.baseline,
    });

    assert.equal(changedRun.status, "changed");
    assert.equal(changedRun.summary.changedPages, 1);
    assert.ok(changedRun.changes.some((change) => change.kind === "title" && change.after === "New title"));
    assert.ok(changedRun.changes.some((change) => change.kind === "metaDescription"));
    assert.ok(changedRun.changes.some((change) => change.kind === "copy"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
