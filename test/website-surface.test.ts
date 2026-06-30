import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSurfacePages,
  normalizeWebsiteSurfaceInput,
  validatePublicWebsiteUrl,
} from "../lib/seo/website-surface";
import { runSeoChangeTracker } from "../lib/seo/seo-change-tracker";
import { buildSeoWatchSlackPayload, notifySeoWatchSlack, shouldSendSeoWatchSlackAlert } from "../lib/seo/slack";

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

test("seo change tracker prefers sitemap pages and keeps optional priority pages", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));

    if (url.pathname === "/robots.txt" || url.pathname === "/sitemap_index.xml") {
      return new Response("not found", { status: 404 });
    }

    if (url.pathname === "/sitemap.xml") {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <urlset>
          <url><loc>https://example.com/from-sitemap</loc></url>
          <url><loc>https://example.com/pricing</loc></url>
        </urlset>`,
        { status: 200, headers: { "content-type": "application/xml" } }
      );
    }

    return new Response(
      `<!doctype html>
      <html>
        <head><title>${url.pathname}</title><meta name="description" content="${url.pathname} description."></head>
        <body><nav><a href="/nav-only">Nav only</a></nav><h1>${url.pathname}</h1><p>Tracked page copy.</p></body>
      </html>`,
      { status: 200, headers: { "content-type": "text/html" } }
    );
  }) as typeof fetch;

  try {
    const run = await runSeoChangeTracker({ siteUrl: "https://example.com", pages: ["/priority"] });
    const urls = run.pages.map((page) => new URL(page.url).pathname);

    assert.deepEqual(urls, ["/", "/priority", "/from-sitemap", "/pricing"]);
    assert.equal(urls.includes("/nav-only"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seo change tracker falls back to homepage navigation when sitemap is unavailable", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));

    if (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml" || url.pathname === "/sitemap_index.xml") {
      return new Response("not found", { status: 404 });
    }

    if (url.pathname === "/") {
      return new Response(
        `<!doctype html>
        <html>
          <head><title>Home</title><meta name="description" content="Home description."></head>
          <body>
            <header>
              <a href="/services">Services</a>
              <a href="/contact">Contact</a>
              <a href="https://other.example/out">External</a>
            </header>
            <h1>Home</h1>
          </body>
        </html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      );
    }

    return new Response(
      `<!doctype html>
      <html>
        <head><title>${url.pathname}</title><meta name="description" content="${url.pathname} description."></head>
        <body><h1>${url.pathname}</h1><p>Tracked page copy.</p></body>
      </html>`,
      { status: 200, headers: { "content-type": "text/html" } }
    );
  }) as typeof fetch;

  try {
    const run = await runSeoChangeTracker({ siteUrl: "https://example.com" });
    const urls = run.pages.map((page) => new URL(page.url).pathname);

    assert.deepEqual(urls, ["/", "/services", "/contact"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seo watch Slack alerts only for baselines and changed scans", async () => {
  const originalFetch = globalThis.fetch;
  let html = `<!doctype html>
    <html>
      <head>
        <title>Old title</title>
        <meta name="description" content="Old description.">
      </head>
      <body><h1>Old H1</h1><p>Original body copy.</p></body>
    </html>`;

  globalThis.fetch = (async () => {
    return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;

  try {
    const baselineRun = await runSeoChangeTracker({ siteUrl: "https://example.com", pages: ["/"] });
    assert.equal(shouldSendSeoWatchSlackAlert(baselineRun), true);

    const baselinePayload = buildSeoWatchSlackPayload({
      dashboardUrl: "https://dashboard.example/seo",
      result: baselineRun,
      scope: { userId: "vast" },
    });
    assert.match(baselinePayload.text, /SEO baseline captured/);
    assert.match(JSON.stringify(baselinePayload.blocks), /A new comparison point is now saved/);

    const unchangedRun = await runSeoChangeTracker({
      siteUrl: "https://example.com",
      pages: ["/"],
      baseline: baselineRun.baseline,
    });
    assert.equal(unchangedRun.status, "unchanged");
    assert.equal(shouldSendSeoWatchSlackAlert(unchangedRun), false);

    html = `<!doctype html>
      <html>
        <head>
          <title>New title</title>
          <meta name="description" content="New description.">
        </head>
        <body><h1>Old H1</h1><p>Updated body copy with launch language.</p></body>
      </html>`;

    const changedRun = await runSeoChangeTracker({
      siteUrl: "https://example.com",
      pages: ["/"],
      baseline: baselineRun.baseline,
    });
    const changedPayload = buildSeoWatchSlackPayload({
      result: changedRun,
      scope: { userId: "vast" },
    });

    assert.equal(shouldSendSeoWatchSlackAlert(changedRun), true);
    assert.match(changedPayload.text, /SEO changes detected/);
    assert.match(JSON.stringify(changedPayload.blocks), /Top changes/);
    assert.match(JSON.stringify(changedPayload.blocks), /Title/);

    const sentPayloads: unknown[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentPayloads.push(JSON.parse(String(init?.body || "{}")));
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    assert.deepEqual(await notifySeoWatchSlack({ result: unchangedRun, scope: { userId: "vast" }, webhookUrl: "https://hooks.slack.test/a" }), {
      status: "skipped",
      reason: "No Slack alert is needed for this SEO tracker status.",
    });
    assert.equal(sentPayloads.length, 0);

    assert.deepEqual(await notifySeoWatchSlack({ result: baselineRun, scope: { userId: "vast" }, webhookUrl: "https://hooks.slack.test/a" }), {
      status: "sent",
    });
    assert.deepEqual(await notifySeoWatchSlack({ result: changedRun, scope: { userId: "vast" }, webhookUrl: "https://hooks.slack.test/a" }), {
      status: "sent",
    });
    assert.equal(sentPayloads.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
