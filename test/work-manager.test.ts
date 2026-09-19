import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import {
  createSourceExternalIdentity,
  isValidWorkIngestRequest,
  normalizeWorkIngestBatch,
  planAutomationUpdate,
} from "../lib/work-manager/ingest";
import { createReviewToken, hashReviewToken, normalizeWorkItemInput, slugifyWorkChannel } from "../lib/work-manager/service";
import type { WorkItem } from "../lib/work-manager/types";
import { notificationReason, plannedNotificationKinds } from "../lib/work-manager/notifications";
import { normalizeWorkGuideUpdate } from "../lib/work-manager/guide";
import { normalizeSlackCandidates } from "../lib/work-manager/intake";
import { isValidMeetingDocExportRequest, toMeetingDocItem } from "../lib/work-manager/meeting-docs";
import { isValidSlackSignature, normalizeSlackTaskEvent } from "../lib/work-manager/slack-events";
import { extractDueDate } from "../lib/work-manager/due-dates";
import { allowsSlackNotification, buildSlackWorkUpdate, notificationKindForTransition } from "../lib/work-manager/slack-notifications";

function exampleWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "item-1",
    client_id: "client-1",
    channel_id: "channel-1",
    title: "Publish founder interview",
    now_text: "Editing",
    next_text: "Review",
    blocker_text: null,
    owner_name: "Award",
    owner_user_id: null,
    status: "in_progress",
    due_date: null,
    source_kind: "slack",
    source_url: "https://example.com/source",
    source_external_id: "source-1:message-1",
    source_snapshot_json: { title: "Publish founder interview", nowText: "Editing" },
    automation_review_needed: false,
    automation_last_seen_at: "2026-09-10T12:00:00.000Z",
    completion_evidence_url: null,
    client_visible: true,
    created_by_user_id: null,
    updated_by_user_id: null,
    created_at: "2026-09-10T12:00:00.000Z",
    updated_at: "2026-09-10T12:00:00.000Z",
    completed_at: null,
    dismissed_at: null,
    dismissed_by_user_id: null,
    dismissal_reason: null,
    dismissal_note: null,
    ...overrides,
  };
}

test("channel names become stable human-readable slugs", () => {
  assert.equal(slugifyWorkChannel("  ABK Video Queue  "), "abk-video-queue");
  assert.equal(slugifyWorkChannel("Q4 / Client Review"), "q4-client-review");
  assert.throws(() => slugifyWorkChannel("---"), /Channel name is required/);
});

test("Slack candidate intake recognizes explicit task tags and stays bounded", () => {
  const intake = normalizeSlackCandidates({ workspaceRef: "circleclick", sourceRef: "C0BE2423W75", messages: [{ externalId: "1.2", text: "@circleclick-task-add publish the approved video" }] });
  assert.equal(intake.messages[0].tagged, true);
  assert.throws(() => normalizeSlackCandidates({ sourceRef: "C", messages: [] }), /between 1 and 50/);
});

test("Slack task dates support ISO and Central Time natural language", () => {
  assert.deepEqual(extractDueDate("@circleclick-task-add due:2026-09-25 Publish the video").dueDate, "2026-09-25");
  assert.deepEqual(extractDueDate("@circleclick-task-add Publish the video by Friday", new Date("2026-09-16T12:00:00Z")), {
    text: "@circleclick-task-add Publish the video",
    dueDate: "2026-09-18",
    reviewNeeded: false,
  });
  assert.equal(extractDueDate("Publish by February 31", new Date("2026-01-01T12:00:00Z")).reviewNeeded, true);
});

test("Slack Events verification accepts fresh signed requests and rejects replay or tampering", () => {
  const secret = "slack-signing-secret";
  const timestamp = "1760000000";
  const body = JSON.stringify({ type: "event_callback" });
  const signature = `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  assert.equal(isValidSlackSignature(body, timestamp, signature, secret, 1760000000), true);
  assert.equal(isValidSlackSignature(body, timestamp, `${signature}x`, secret, 1760000000), false);
  assert.equal(isValidSlackSignature(body, timestamp, signature, secret, 1760000601), false);
});

test("Slack Events only forwards the explicit developer-requests command", () => {
  const base = { type: "event_callback", team_id: "T09EZFPHN" };
  const accepted = normalizeSlackTaskEvent({
    ...base,
    event: { type: "message", channel: "C072BE92C4X", channel_type: "channel", user: "U1", ts: "1789769000.123456", text: "@circleclick-task-add This is a test task" },
  }, { workspaceId: "T09EZFPHN", channelId: "C072BE92C4X" });
  assert.equal(accepted?.message.externalId, "1789769000.123456");
  assert.equal(accepted?.message.sourceUrl, "https://circleclick.slack.com/archives/C072BE92C4X/p1789769000123456");
  assert.equal(normalizeSlackTaskEvent({ ...base, event: { type: "message", channel: "C072BE92C4X", ts: "1.2", text: "ordinary conversation" } }, { workspaceId: "T09EZFPHN", channelId: "C072BE92C4X" }), null);
  assert.equal(normalizeSlackTaskEvent({ ...base, event: { type: "message", channel: "C0BE2423W75", ts: "1.3", text: "@circleclick-task-add wrong channel" } }, { workspaceId: "T09EZFPHN", channelId: "C072BE92C4X" }), null);
});

test("Done and Blocked require explicit evidence", () => {
  const base = {
    channelId: "video-queue",
    title: "Publish founder interview",
    nowText: "Final export is ready.",
    nextText: "Publish after approval.",
  };

  assert.throws(
    () => normalizeWorkItemInput({ ...base, status: "done" }),
    /Completion evidence is required/
  );
  assert.throws(
    () => normalizeWorkItemInput({ ...base, status: "blocked" }),
    /Describe the blocker/
  );
  assert.equal(
    normalizeWorkItemInput({
      ...base,
      status: "done",
      completionEvidenceUrl: "https://example.com/published-video",
    }).status,
    "done"
  );
});

test("work input rejects non-web evidence links", () => {
  assert.throws(
    () => normalizeWorkItemInput({
      channelId: "video-queue",
      title: "Publish founder interview",
      sourceUrl: "javascript:alert(1)",
    }),
    /Only HTTP and HTTPS/
  );
});

test("review tokens are high entropy and only their fixed-size hash needs storage", () => {
  const first = createReviewToken();
  const second = createReviewToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{40,80}$/);
  assert.match(hashReviewToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashReviewToken(first), first);
});

test("automation intake is signed, bounded, and fail-closed", () => {
  const secret = "12345678901234567890123456789012";
  assert.equal(
    isValidWorkIngestRequest(new Request("https://dashboard.example/api/work-manager/ingest", {
      headers: { authorization: `Bearer ${secret}` },
    }), secret),
    true
  );
  assert.equal(
    isValidWorkIngestRequest(new Request("https://dashboard.example/api/work-manager/ingest", {
      headers: { authorization: "Bearer wrong-secret" },
    }), secret),
    false
  );
  assert.equal(isValidWorkIngestRequest(new Request("https://dashboard.example"), "short"), false);

  const batch = normalizeWorkIngestBatch({
    sourceKind: "slack",
    workspaceRef: "circleclick",
    sourceRef: "C0BE2423W75",
    items: [{ externalId: "1712345.6789", title: "Publish video", status: "done" }],
  });
  assert.equal(batch.items[0].status, "needs_evidence");
  assert.equal(createSourceExternalIdentity("source-1", batch.items[0].externalId), "source-1:1712345.6789");
  assert.throws(
    () => normalizeWorkIngestBatch({ sourceKind: "slack", sourceRef: "channel", items: [] }),
    /between 1 and 50/
  );
});

test("automation updates its own rows but only proposes changes to human-owned rows", () => {
  const timestamp = "2026-09-10T13:00:00.000Z";
  const existing = exampleWorkItem();
  const incoming = {
    channel_id: existing.channel_id,
    title: existing.title,
    now_text: "Client review is ready",
    next_text: "Publish after approval",
    blocker_text: null,
    owner_name: existing.owner_name,
    owner_user_id: existing.owner_user_id,
    status: "in_progress" as const,
    due_date: null,
    source_kind: "slack" as const,
    source_url: existing.source_url,
    source_external_id: existing.source_external_id,
    source_snapshot_json: { title: existing.title, nowText: "Client review is ready" },
    automation_review_needed: false,
    automation_last_seen_at: timestamp,
    completion_evidence_url: null,
    client_visible: true,
    completed_at: null,
  };

  const automatic = planAutomationUpdate(existing, incoming, timestamp);
  assert.equal(automatic.outcome, "updated");
  assert.equal(automatic.next.now_text, "Client review is ready");

  const humanOwned = planAutomationUpdate(
    exampleWorkItem({ updated_by_user_id: "human-1", now_text: "Human confirmed this wording" }),
    incoming,
    timestamp
  );
  assert.equal(humanOwned.outcome, "proposed");
  assert.equal(humanOwned.next.now_text, "Human confirmed this wording");
  assert.equal(humanOwned.next.automation_review_needed, true);
});

test("notification planning is actionable and does not emit routine noise", () => {
  const original = exampleWorkItem();
  const assignedAndBlocked = exampleWorkItem({ owner_user_id: "user-2", status: "blocked", blocker_text: "Client approval is missing." });
  assert.deepEqual(plannedNotificationKinds(original, assignedAndBlocked), ["assigned", "blocked"]);
  assert.deepEqual(plannedNotificationKinds(assignedAndBlocked, { ...assignedAndBlocked, now_text: "Minor wording change" }), []);
  assert.equal(notificationReason("blocked", assignedAndBlocked), "Blocked: Client approval is missing.");
});

test("Slack completion notifications are opt-in and transition-only", () => {
  const before = exampleWorkItem({ status: "in_progress" });
  const done = exampleWorkItem({ status: "done", completion_evidence_url: "https://example.com/proof" });
  const blocked = exampleWorkItem({ status: "blocked", blocker_text: "Needs approval" });
  assert.equal(notificationKindForTransition(before, done), "completed");
  assert.equal(notificationKindForTransition(before, blocked), "blocked");
  assert.equal(notificationKindForTransition(done, done), null);
  assert.equal(allowsSlackNotification("never", "completed"), false);
  assert.equal(allowsSlackNotification("completed", "blocked"), false);
  assert.equal(allowsSlackNotification("completed_and_blocked", "blocked"), true);
  assert.match(buildSlackWorkUpdate(done, "completed"), /Publish founder interview/);
});

test("work guide progress is bounded and completion always records the final step", () => {
  assert.deepEqual(normalizeWorkGuideUpdate({ status: "in_progress", currentStep: 2 }), { status: "in_progress", currentStep: 2 });
  assert.deepEqual(normalizeWorkGuideUpdate({ status: "completed", currentStep: 1 }), { status: "completed", currentStep: 4 });
  assert.deepEqual(normalizeWorkGuideUpdate({ status: "dismissed", currentStep: 99 }), { status: "dismissed", currentStep: 4 });
  assert.deepEqual(normalizeWorkGuideUpdate({ status: "unexpected", currentStep: "nope" }), { status: "in_progress", currentStep: 0 });
});

test("meeting document payload keeps human work fields and omits private implementation data", () => {
  assert.deepEqual(toMeetingDocItem(exampleWorkItem({ blocker_text: "Waiting for approval" }), "Video Queue"), {
    id: "item-1",
    title: "Publish founder interview",
    ownerName: "Award",
    dueDate: "",
    status: "in_progress",
    channelName: "Video Queue",
    nowText: "Editing",
    nextText: "Review",
    blockerText: "Waiting for approval",
    dismissed: false,
  });
});

test("meeting document export fails closed without the shared bearer secret", () => {
  const previous = process.env.DASHBOARD_DOC_SYNC_SECRET;
  process.env.DASHBOARD_DOC_SYNC_SECRET = "12345678901234567890123456789012";
  try {
    assert.equal(isValidMeetingDocExportRequest(new Request("https://dashboard.example/api/work-manager/meeting-document")), false);
    assert.equal(isValidMeetingDocExportRequest(new Request("https://dashboard.example/api/work-manager/meeting-document", {
      headers: {authorization: "Bearer 12345678901234567890123456789012"},
    })), true);
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_DOC_SYNC_SECRET;
    else process.env.DASHBOARD_DOC_SYNC_SECRET = previous;
  }
});

test("client review is public while Work Manager APIs remain session-protected", async () => {
  const previousSecret = process.env.SEO_APP_SESSION_TOKEN;
  process.env.SEO_APP_SESSION_TOKEN = "work-manager-test-secret";
  try {
    const publicReview = await proxy(new NextRequest("https://dashboard.example/review/example-token"));
    assert.equal(publicReview.headers.get("x-middleware-next"), "1");

    const protectedApi = await proxy(new NextRequest("https://dashboard.example/api/work-manager/items"));
    assert.equal(protectedApi.status, 307);
    assert.equal(protectedApi.headers.get("location"), "https://dashboard.example/login?next=%2Fapi%2Fwork-manager%2Fitems");

    const ingestPost = await proxy(new NextRequest("https://dashboard.example/api/work-manager/ingest", { method: "POST" }));
    assert.equal(ingestPost.headers.get("x-middleware-next"), "1");
    const ingestGet = await proxy(new NextRequest("https://dashboard.example/api/work-manager/ingest"));
    assert.equal(ingestGet.status, 307);
    const slackIntakePost = await proxy(new NextRequest("https://dashboard.example/api/work-manager/intake/slack", { method: "POST" }));
    assert.equal(slackIntakePost.headers.get("x-middleware-next"), "1");
    const meetingExportGet = await proxy(new NextRequest("https://dashboard.example/api/work-manager/meeting-document?client=Vast.ai"));
    assert.equal(meetingExportGet.headers.get("x-middleware-next"), "1");
  } finally {
    if (previousSecret === undefined) delete process.env.SEO_APP_SESSION_TOKEN;
    else process.env.SEO_APP_SESSION_TOKEN = previousSecret;
  }
});

test("the unauthenticated Work Manager fixture is local-development only", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.SEO_APP_SESSION_TOKEN;
  process.env.SEO_APP_SESSION_TOKEN = "work-manager-test-secret";
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    const localPreview = await proxy(
      new NextRequest("http://127.0.0.1:3020/?preview=work-manager")
    );
    assert.equal(localPreview.headers.get("x-middleware-next"), "1");

    Object.assign(process.env, { NODE_ENV: "production" });
    const productionPreview = await proxy(
      new NextRequest("https://dashboard.example/?preview=work-manager")
    );
    assert.equal(productionPreview.status, 307);
    assert.equal(
      productionPreview.headers.get("location"),
      "https://dashboard.example/login?next=%2F%3Fpreview%3Dwork-manager"
    );
  } finally {
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    if (previousSecret === undefined) delete process.env.SEO_APP_SESSION_TOKEN;
    else process.env.SEO_APP_SESSION_TOKEN = previousSecret;
  }
});
