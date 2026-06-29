import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSurfacePages,
  normalizeWebsiteSurfaceInput,
  validatePublicWebsiteUrl,
} from "../lib/seo/website-surface";

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
