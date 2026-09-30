import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { assertCronRequest } from "../lib/seo/cron";
import { GET as getSlackGuide } from "../app/api/work-manager/slack/guide/route";

test("scheduled sync reaches its bearer-token guard without an app cookie", async () => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-scheduler-secret";
  try {
    for (const url of ["https://dashboard.example/api/seo/cron/daily", "https://dashboard.example/api/work-manager/slack/guide"]) {
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
    }
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});

test("Slack guide cron rejects missing authorization before any delivery", async () => {
  const previous = process.env.CRON_SECRET;
  const previousEnabled = process.env.WORK_MANAGER_SLACK_GUIDE_ENABLED;
  process.env.CRON_SECRET = "test-scheduler-secret";
  delete process.env.WORK_MANAGER_SLACK_GUIDE_ENABLED;
  try {
    const url = "https://dashboard.example/api/work-manager/slack/guide";
    const response = await getSlackGuide(new Request(url));
    assert.equal(response.status, 401);
    const disabled = await getSlackGuide(new Request(url, { headers: { authorization: "Bearer test-scheduler-secret" } }));
    assert.deepEqual(await disabled.json(), { outcome: "disabled" });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
    if (previousEnabled === undefined) delete process.env.WORK_MANAGER_SLACK_GUIDE_ENABLED;
    else process.env.WORK_MANAGER_SLACK_GUIDE_ENABLED = previousEnabled;
  }
});
