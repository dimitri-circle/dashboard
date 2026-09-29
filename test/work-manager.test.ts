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
import { buildMissingTaskDetailsPrompt, extractSlackTaskDescription, findRoutingMatch, missingTaskDetails, normalizeSlackCandidates } from "../lib/work-manager/intake";
import { isValidMeetingDocExportRequest, toMeetingDocItem } from "../lib/work-manager/meeting-docs";
import { isValidSlackSignature, normalizeSlackTaskEvent, parseSlackCommand } from "../lib/work-manager/slack-events";
import { formatSlackStatus, resolveStatusClient } from "../lib/work-manager/slack-status";
import { extractDueDate } from "../lib/work-manager/due-dates";
import { allowsSlackNotification, buildSlackWorkUpdate, notificationKindForTransition } from "../lib/work-manager/slack-notifications";
import { nextWorkflowStage, statusForWorkflowStage, workflowBadgeLabel, workflowStageFor } from "../lib/work-manager/workflow";

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

test("workflow stages advance in order while attention status stays separate", () => {
  const item = exampleWorkItem({ status: "blocked", workflow_stage: "client_review" });
  assert.equal(workflowStageFor(item), "client_review");
  assert.equal(nextWorkflowStage("ready"), "in_progress");
  assert.equal(nextWorkflowStage("in_progress"), "client_review");
  assert.equal(nextWorkflowStage("client_review"), "done");
  assert.equal(nextWorkflowStage("done"), null);
  assert.equal(statusForWorkflowStage("client_review"), "in_progress");
  assert.equal(workflowStageFor(exampleWorkItem({ status: "blocked", workflow_stage: null })), null);
  assert.equal(workflowStageFor(exampleWorkItem({ status: "new", workflow_stage: undefined })), "ready");
});

test("workflow badge shows the saved stage instead of a stale compatibility status", () => {
  assert.equal(workflowBadgeLabel({ status: "in_progress", workflow_stage: "client_review" }), "Client Review");
  assert.equal(workflowBadgeLabel({ status: "blocked", workflow_stage: "client_review" }), "Blocked");
});

test("Slack candidate intake recognizes explicit task tags and stays bounded", () => {
  const intake = normalizeSlackCandidates({ workspaceRef: "circleclick", sourceRef: "C0BE2423W75", messages: [{ externalId: "1.2", text: "@circleclick-task-add publish the approved video" }] });
  assert.equal(intake.messages[0].tagged, true);
  assert.equal(normalizeSlackCandidates({ workspaceRef: "circleclick", sourceRef: "C0ATZ3A3K0X", messages: [{ externalId: "1.3", text: "@task-add Publish the video by Friday VAST" }] }).messages[0].tagged, true);
  assert.throws(() => normalizeSlackCandidates({ sourceRef: "C", messages: [] }), /between 1 and 50/);
});

test("Slack asks for missing dates and client choices before adding work", () => {
  assert.equal(buildMissingTaskDetailsPrompt({
    needsDueDate: true,
    needsClient: true,
    clientNames: ["VAST", "ABK Labs"],
  }), 'Please add a due-by date (example: “by Friday” or “due:2026-09-30”) and a client (choose: ABK Labs, VAST) to the task, then send the command again. Example: @task-add Publish the approved video by Friday VAST');
  assert.equal(buildMissingTaskDetailsPrompt({
    needsDueDate: false,
    needsClient: false,
    clientNames: [],
    selectedClientName: "VAST",
    workstreamNames: ["Social", "Video Queue"],
  }), 'Please add a workstream for VAST (choose: Social, Video Queue) to the task, then send the command again. Example: @task-add Publish the approved video by Friday VAST Social');
});

test("Slack intake blocks missing dates, missing clients, and unclear workstreams", () => {
  const clients = [{ id: "vast", name: "VAST" }, { id: "abk", name: "ABK Labs" }];
  const channels = [
    { id: "vast-video", client_id: "vast", name: "Video Queue" },
    { id: "vast-social", client_id: "vast", name: "Social" },
  ];
  assert.match(missingTaskDetails("@circleclick-task-add VAST Video Queue publish", "", clients, channels)?.prompt || "", /due-by date/);
  assert.match(missingTaskDetails("@circleclick-task-add due:2026-09-30 publish", "2026-09-30", clients, channels)?.prompt || "", /ABK Labs, VAST/);
  assert.match(missingTaskDetails("@circleclick-task-add due:2026-09-30 VAST publish", "2026-09-30", clients, channels)?.prompt || "", /Social, Video Queue/);
  assert.equal(missingTaskDetails("@circleclick-task-add due:2026-09-30 VAST Video Queue publish", "2026-09-30", clients, channels), null);
  assert.match(missingTaskDetails("@task-add VAST Video Queue", "", clients, channels)?.prompt || "", /task description.*due-by date/);
  assert.equal(missingTaskDetails("@task-add Publish the video VAST Video Queue", "2026-09-30", clients, channels), null);
});

test("client routing is case-insensitive and requires one exact client and owned workstream", () => {
  const clients = [{ id: "vast", name: "VAST" }, { id: "abk", name: "ABK Labs" }];
  const channels = [{ id: "vast-video", client_id: "vast", name: "Video Queue" }, { id: "abk-video", client_id: "abk", name: "Video Queue" }];
  assert.deepEqual(findRoutingMatch("@circleclick-task-add VAST Video Queue publish new video", clients, channels), {
    clientId: "vast", channelId: "vast-video", reviewNeeded: false,
  });
  assert.deepEqual(findRoutingMatch("@circleclick-task-add vaSt publish new video", clients, channels.slice(0, 1)), {
    clientId: "vast", channelId: "vast-video", reviewNeeded: false,
  });
  assert.deepEqual(findRoutingMatch("@circleclick-task-add vast publish new video", clients, []), {
    createWorkstreamForClientId: "vast", reviewNeeded: false,
  });
  assert.deepEqual(findRoutingMatch("@circleclick-task-add VAST publish", clients, [
    ...channels.slice(0, 1), { id: "vast-social", client_id: "vast", name: "Social" },
  ]), { suggestedClientId: "vast", reviewNeeded: true });
  assert.deepEqual(findRoutingMatch("@circleclick-task-add VAST Social publish", clients, [
    ...channels.slice(0, 1), { id: "vast-social", client_id: "vast", name: "Social" },
  ]), { clientId: "vast", channelId: "vast-social", reviewNeeded: false });
  assert.deepEqual(findRoutingMatch("@circleclick-task-add VAST Video Queue publish", clients, [
    { id: "vast-video", client_id: "vast", name: "Video Queue", active: false },
  ]), { suggestedClientId: "vast", reviewNeeded: true });
  assert.deepEqual(findRoutingMatch("@circleclick-task-add for VAST publish new video", clients, channels), {
    clientId: "vast", channelId: "vast-video", reviewNeeded: false,
  });
  assert.deepEqual(findRoutingMatch("@circleclick-task-add Video Queue publish", clients, channels), { reviewNeeded: false });
  assert.deepEqual(findRoutingMatch("@circleclick-task-add VAST and ABK Labs: publish video", clients, channels), { reviewNeeded: true });
});

test("Slack task dates support ISO and Central Time natural language", () => {
  assert.deepEqual(extractDueDate("@circleclick-task-add due:2026-09-25 Publish the video").dueDate, "2026-09-25");
  assert.deepEqual(extractDueDate("@circleclick-task-add Publish the video by Friday", new Date("2026-09-16T12:00:00Z")), {
    text: "@circleclick-task-add Publish the video",
    dueDate: "2026-09-18",
    reviewNeeded: false,
  });
  assert.equal(extractDueDate("Publish by February 31", new Date("2026-01-01T12:00:00Z")).reviewNeeded, true);
  assert.deepEqual(extractDueDate("@task-add Publish the video by 2026-10-02 VAST").dueDate, "2026-10-02");
  assert.deepEqual(extractDueDate("@task-add Publish by 2026-02-31 VAST").dueDate, "");
});

test("Slack add command saves the task description without trailing routing labels", () => {
  assert.equal(extractSlackTaskDescription("@task-add Publish the approved video VAST Video Queue", "VAST", "Video Queue"), "Publish the approved video");
  assert.equal(extractSlackTaskDescription("@task-add Publish the approved video Video Queue VAST", "VAST", "Video Queue"), "Publish the approved video");
  assert.equal(extractSlackTaskDescription("@task-add Publish VAST video", "VAST", "Video Queue"), "Publish VAST video");
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

test("Slack Events only routes exact commands in the two approved channels", () => {
  const base = { type: "event_callback", team_id: "T09EZFPHN" };
  const config = { workspaceId: "T09EZFPHN", channelIds: ["C072BE92C4X", "C0ATZ3A3K0X"] };
  const accepted = normalizeSlackTaskEvent({
    ...base,
    event: { type: "message", channel: "C072BE92C4X", channel_type: "channel", user: "U1", ts: "1789769000.123456", text: "@circleclick-task-add This is a test task" },
  }, config);
  assert.equal(accepted?.message.externalId, "1789769000.123456");
  assert.equal(accepted?.message.threadTs, "1789769000.123456");
  const threaded = normalizeSlackTaskEvent({
    ...base,
    event: { type: "message", channel: "C072BE92C4X", channel_type: "channel", user: "U1", ts: "1789769001.654321", thread_ts: "1789769000.123456", text: "@circleclick-task-add due:2026-09-30 VAST Video Queue publish new video" },
  }, config);
  assert.equal(threaded?.message.threadTs, "1789769000.123456");
  const design = normalizeSlackTaskEvent({ ...base,
    event: { type: "message", channel: "C0ATZ3A3K0X", channel_type: "channel", user: "U2", ts: "1789769002.123456", text: "@task-status VAST" },
  }, config);
  assert.equal(design?.command.kind, "status");
  assert.equal(design?.command.argument, "VAST");
  assert.equal(design?.sourceRef, "C0ATZ3A3K0X");
  assert.equal(parseSlackCommand("@task-add Publish the video by Friday VAST")?.kind, "add");
  assert.equal(parseSlackCommand("Here is @task-add hidden in a sentence"), null);
  assert.equal(parseSlackCommand("@task-addendum should not match"), null);
  assert.equal(accepted?.message.sourceUrl, "https://circleclick.slack.com/archives/C072BE92C4X/p1789769000123456");
  assert.equal(normalizeSlackTaskEvent({ ...base, event: { type: "message", channel: "C072BE92C4X", user: "U1", ts: "1.2", text: "ordinary conversation" } }, config), null);
  assert.equal(normalizeSlackTaskEvent({ ...base, event: { type: "message", channel: "C0BE2423W75", user: "U1", ts: "1.3", text: "@task-add wrong channel" } }, config), null);
  assert.equal(normalizeSlackTaskEvent({ ...base, event: { type: "message", channel: "C0ATZ3A3K0X", bot_id: "B1", ts: "1.4", text: "@task-status VAST" } }, config), null);
  assert.equal(normalizeSlackTaskEvent({ ...base, event: { type: "message", channel: "C0ATZ3A3K0X", channel_type: "group", user: "U1", ts: "1.5", text: "@task-status VAST" } }, config), null);
  assert.equal(normalizeSlackTaskEvent({ ...base, team_id: "TOTHER", event: { type: "message", channel: "C0ATZ3A3K0X", user: "U1", ts: "1.6", text: "@task-status VAST" } }, config), null);
});

test("task status resolves exact clients and formats only supplied visible work", () => {
  const clients = [{ id: "vast", name: "VAST" }, { id: "abk", name: "ABK Labs" }];
  assert.deepEqual(resolveStatusClient("vast", clients), [{ id: "vast", name: "VAST" }]);
  assert.deepEqual(resolveStatusClient("VA", clients), []);
  assert.match(formatSlackStatus("VAST", [], 0), /no client-visible work/);
  const result = formatSlackStatus("VAST", [{ id: "item-1", title: "Publish <@U1> video", status: "blocked", workflow_stage: "in_progress", due_date: "2026-10-02" }], 1);
  assert.match(result, /Blocked · due 2026-10-02/);
  assert.match(result, /Publish &lt;@U1&gt; video/);
  assert.match(result, /\/work-manager\/items\/item-1/);
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
  assert.match(buildSlackWorkUpdate(done, "completed"), /^Work completed: https:\/\//);
  assert.doesNotMatch(buildSlackWorkUpdate(done, "completed"), /Publish founder interview/);
  assert.match(buildSlackWorkUpdate(done, "completed"), /dashboard-circleclick\.vercel\.app\/work-manager\/items\/item-1/);
  assert.doesNotMatch(buildSlackWorkUpdate(done, "completed"), /example\.com\/source/);
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

    const protectedItemLink = await proxy(new NextRequest("https://dashboard.example/work-manager/items/item-1"));
    assert.equal(protectedItemLink.status, 307);
    assert.equal(protectedItemLink.headers.get("location"), "https://dashboard.example/login?next=%2Fwork-manager%2Fitems%2Fitem-1");

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
