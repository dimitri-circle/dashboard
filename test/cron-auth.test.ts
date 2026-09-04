import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { assertCronRequest } from "../lib/seo/cron";

test("scheduled sync reaches its bearer-token guard without an app cookie", async () => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-scheduler-secret";
  try {
    const url = "https://dashboard.example/api/seo/cron/daily";
    const unauthenticated = new NextRequest(url);
    assert.equal((await proxy(unauthenticated)).headers.get("x-middleware-next"), "1");
    assert.throws(() => assertCronRequest(unauthenticated), /Unauthorized/);
    assert.throws(() => assertCronRequest(new Request(url, {
      headers: { authorization: "Bearer wrong-secret" },
    })), /Unauthorized/);
    const scheduled = new NextRequest(url, {
      headers: { authorization: "Bearer test-scheduler-secret" },
    });
    assert.equal((await proxy(scheduled)).headers.get("x-middleware-next"), "1");
    assert.doesNotThrow(() => assertCronRequest(scheduled));
    for (const protectedRequest of [
      new NextRequest("https://dashboard.example/"),
      new NextRequest(`${url}/unexpected`),
      new NextRequest(url, { method: "POST" }),
    ]) {
      assert.equal((await proxy(protectedRequest)).status, 307);
    }
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});
