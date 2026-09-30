import assert from "node:assert/strict";
import test from "node:test";
import { buildSlackDashboardGuide, guideReminderDate, runSlackDashboardGuide, slackGuideEnabled } from "../lib/work-manager/slack-guide";

test("guide stays off until explicitly enabled", async () => {
  assert.equal(slackGuideEnabled(undefined), false);
  assert.equal(slackGuideEnabled("false"), false);
  assert.equal(slackGuideEnabled("true"), true);
  const previous = process.env.WORK_MANAGER_SLACK_GUIDE_ENABLED;
  delete process.env.WORK_MANAGER_SLACK_GUIDE_ENABLED;
  try {
    assert.deepEqual(await runSlackDashboardGuide(new Date("2026-09-29T14:00:00Z")), { outcome: "disabled" });
  } finally {
    if (previous === undefined) delete process.env.WORK_MANAGER_SLACK_GUIDE_ENABLED;
    else process.env.WORK_MANAGER_SLACK_GUIDE_ENABLED = previous;
  }
});

test("guide sends at 9 AM Central only on workdays", () => {
  assert.equal(guideReminderDate(new Date("2026-09-29T14:00:00Z")), "2026-09-29");
  assert.equal(guideReminderDate(new Date("2026-09-29T15:00:00Z")), null);
  assert.equal(guideReminderDate(new Date("2026-12-01T15:00:00Z")), "2026-12-01");
  assert.equal(guideReminderDate(new Date("2026-12-01T14:00:00Z")), null);
  assert.equal(guideReminderDate(new Date("2026-10-03T14:00:00Z")), null);
});

test("guide repeats every other workday and never repeats the same day", () => {
  const tuesday = "2026-09-29T14:00:00Z";
  assert.equal(guideReminderDate(new Date("2026-09-29T14:00:00Z"), tuesday), null);
  assert.equal(guideReminderDate(new Date("2026-09-30T14:00:00Z"), tuesday), null);
  assert.equal(guideReminderDate(new Date("2026-10-01T14:00:00Z"), tuesday), "2026-10-01");
  const friday = "2026-10-02T14:00:00Z";
  assert.equal(guideReminderDate(new Date("2026-10-05T14:00:00Z"), friday), null);
  assert.equal(guideReminderDate(new Date("2026-10-06T14:00:00Z"), friday), "2026-10-06");
  assert.equal(guideReminderDate(new Date("2026-10-06T14:00:00Z"), "invalid"), null);
});

test("guide names both supported commands without showing client-only data", () => {
  const guide = buildSlackDashboardGuide("https://dashboard-circleclick.vercel.app/");
  assert.match(guide, /@task-add/);
  assert.match(guide, /@task-status/);
  assert.match(guide, /internal-only tasks stay private/);
  assert.match(guide, /https:\/\/dashboard-circleclick\.vercel\.app\/\|Open the dashboard/);
});
