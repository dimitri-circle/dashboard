import assert from "node:assert/strict";
import test from "node:test";
import { formatSlackStatus, formatSlackTaskHelp, parseStatusQuery, resolveStatusClient } from "../lib/work-manager/slack-status";

test("status query accepts a client alone or an explicit Central Time cutoff", () => {
  const thursdayNight = new Date("2026-09-18T04:59:00Z"); // Thursday 11:59 PM in Chicago.
  assert.deepEqual(parseStatusQuery("ABK Labs", thursdayNight), {
    clientName: "ABK Labs", dueOnOrBefore: null, invalidDate: false,
  });
  assert.deepEqual(parseStatusQuery("VAST by Friday", thursdayNight), {
    clientName: "VAST", dueOnOrBefore: "2026-09-18", invalidDate: false,
  });
  assert.deepEqual(parseStatusQuery("VAST by Friday", new Date("2026-09-18T05:01:00Z")), {
    clientName: "VAST", dueOnOrBefore: "2026-09-25", invalidDate: false,
  });
  assert.deepEqual(parseStatusQuery("VAST by next Friday", thursdayNight), {
    clientName: "VAST", dueOnOrBefore: "2026-09-25", invalidDate: false,
  });
  assert.deepEqual(parseStatusQuery("VAST due:2026-10-02", thursdayNight), {
    clientName: "VAST", dueOnOrBefore: "2026-10-02", invalidDate: false,
  });
  assert.deepEqual(parseStatusQuery("VAST by January 2", new Date("2026-12-31T16:00:00Z")), {
    clientName: "VAST", dueOnOrBefore: "2027-01-02", invalidDate: false,
  });
});

test("status query asks for clarification instead of guessing an unclear date", () => {
  assert.equal(parseStatusQuery("VAST by 2026-02-31").invalidDate, true);
  assert.equal(parseStatusQuery("VAST by tomorrow").invalidDate, true);
  assert.deepEqual(resolveStatusClient("vast", [{ id: "1", name: "VAST" }, { id: "2", name: "ABK Labs" }]), [{ id: "1", name: "VAST" }]);
});

test("status reply labels the inclusive cutoff and keeps task links", () => {
  assert.match(formatSlackStatus("VAST", [], 0, "2026-09-25"), /no client-visible work due on or before 2026-09-25/);
  const reply = formatSlackStatus("VAST", [{ id: "task-1", title: "Fix <pricing>", status: "in_progress", due_date: "2026-09-25" }], 1, "2026-09-25");
  assert.match(reply, /1 client-visible task due on or before 2026-09-25/);
  assert.match(reply, /due 2026-09-25/);
  assert.match(reply, /Fix &lt;pricing&gt;/);
  assert.match(reply, /\/work-manager\/items\/task-1/);
});

test("help reply shows two daily commands and same-thread correction", () => {
  const help = formatSlackTaskHelp();
  assert.match(help, /@task-add Fix pricing page for VAST by Friday/);
  assert.match(help, /@task-status VAST by Friday/);
  assert.match(help, /same thread/);
  assert.match(help, /Internal tasks stay private/);
});
