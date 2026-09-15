import assert from "node:assert/strict";
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
    ...overrides,
  };
}

test("channel names become stable human-readable slugs", () => {
  assert.equal(slugifyWorkChannel("  ABK Video Queue  "), "abk-video-queue");
  assert.equal(slugifyWorkChannel("Q4 / Client Review"), "q4-client-review");
  assert.throws(() => slugifyWorkChannel("---"), /Channel name is required/);
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
