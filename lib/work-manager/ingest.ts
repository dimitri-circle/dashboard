import crypto, { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/seo/db";
import { safelyCreateWorkNotifications } from "./notifications";
import { normalizeWorkItemInput } from "./service";
import {
  WORK_STATUSES,
  type WorkAutomationSource,
  type WorkIngestBatch,
  type WorkIngestItemInput,
  type WorkIngestResult,
  type WorkItem,
  type WorkStatus,
} from "./types";

const MAX_BATCH_ITEMS = 50;

type NormalizedIngestItem = WorkIngestItemInput & {
  status: WorkStatus;
  blockerText: string;
  ownerName: string;
  nowText: string;
  nextText: string;
  dueDate: string;
  sourceUrl: string;
  completionEvidenceUrl: string;
};

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Automation payload must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown, maximumLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function asOptionalUrl(value: unknown) {
  const raw = asText(value, 2000);
  if (!raw) return "";
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Automation links must use HTTP or HTTPS.");
  }
  return url.toString();
}

function normalizeIngestItem(value: unknown, index: number): NormalizedIngestItem {
  const item = asObject(value);
  const externalId = asText(item.externalId, 180);
  const title = asText(item.title, 180);
  if (!externalId) throw new Error(`Item ${index + 1} needs a stable externalId.`);
  if (!title) throw new Error(`Item ${index + 1} needs a title.`);

  let status = asText(item.status, 40) || "new";
  if (!WORK_STATUSES.includes(status as WorkStatus)) {
    throw new Error(`Item ${index + 1} has an unsupported status.`);
  }
  const blockerText = asText(item.blockerText, 1600);
  const completionEvidenceUrl = asOptionalUrl(item.completionEvidenceUrl);
  if (status === "done" && !completionEvidenceUrl) status = "needs_evidence";
  if (status === "blocked" && !blockerText) status = "unknown";

  const dueDate = asText(item.dueDate, 10);
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)))) {
    throw new Error(`Item ${index + 1} has an invalid dueDate; use YYYY-MM-DD.`);
  }

  return {
    externalId,
    title,
    nowText: asText(item.nowText, 2400),
    nextText: asText(item.nextText, 2400),
    blockerText,
    ownerName: asText(item.ownerName, 120),
    status: status as WorkStatus,
    dueDate,
    sourceUrl: asOptionalUrl(item.sourceUrl),
    completionEvidenceUrl,
    clientVisible: typeof item.clientVisible === "boolean" ? item.clientVisible : undefined,
  };
}

export function normalizeWorkIngestBatch(value: unknown): WorkIngestBatch & { items: NormalizedIngestItem[] } {
  const payload = asObject(value);
  const sourceKind = asText(payload.sourceKind, 40);
  if (sourceKind !== "slack" && sourceKind !== "google_meet") {
    throw new Error("sourceKind must be slack or google_meet.");
  }
  const sourceRef = asText(payload.sourceRef, 220);
  if (!sourceRef) throw new Error("sourceRef is required.");
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > MAX_BATCH_ITEMS) {
    throw new Error(`items must contain between 1 and ${MAX_BATCH_ITEMS} work updates.`);
  }
  return {
    sourceKind,
    workspaceRef: asText(payload.workspaceRef, 220),
    sourceRef,
    items: payload.items.map(normalizeIngestItem),
  };
}

export function createSourceExternalIdentity(sourceId: string, externalId: string) {
  const identity = `${sourceId}:${externalId}`;
  if (identity.length > 220) throw new Error("Source identity is too long.");
  return identity;
}

function safeEqual(left: string, right: string) {
  const leftDigest = crypto.createHash("sha256").update(left).digest();
  const rightDigest = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

export function isValidWorkIngestRequest(request: Request, configuredSecret: string | undefined) {
  const secret = configuredSecret?.trim();
  if (!secret || secret.length < 24) return false;
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : request.headers.get("x-work-manager-ingest-secret")?.trim() || "";
  return safeEqual(supplied, secret);
}

function sourceSnapshot(item: NormalizedIngestItem) {
  return {
    externalId: item.externalId,
    title: item.title,
    nowText: item.nowText,
    nextText: item.nextText,
    blockerText: item.blockerText,
    ownerName: item.ownerName,
    status: item.status,
    dueDate: item.dueDate,
    sourceUrl: item.sourceUrl,
    completionEvidenceUrl: item.completionEvidenceUrl,
    clientVisible: item.clientVisible,
  };
}

function materialAutomationFields(item: Partial<WorkItem>) {
  return {
    channel_id: item.channel_id,
    title: item.title,
    now_text: item.now_text,
    next_text: item.next_text,
    blocker_text: item.blocker_text,
    owner_name: item.owner_name,
    status: item.status,
    due_date: item.due_date,
    source_url: item.source_url,
    completion_evidence_url: item.completion_evidence_url,
    client_visible: item.client_visible,
  };
}

export function planAutomationUpdate(
  existing: WorkItem,
  incoming: Omit<WorkItem, "id" | "client_id" | "created_by_user_id" | "updated_by_user_id" | "created_at" | "updated_at">,
  timestamp: string
) {
  const snapshotChanged = JSON.stringify(existing.source_snapshot_json || {}) !== JSON.stringify(incoming.source_snapshot_json);
  if (existing.updated_by_user_id) {
    return {
      outcome: snapshotChanged ? "proposed" as const : "unchanged" as const,
      next: {
        ...existing,
        source_snapshot_json: incoming.source_snapshot_json,
        automation_review_needed: snapshotChanged || existing.automation_review_needed,
        automation_last_seen_at: timestamp,
      },
    };
  }

  const automationChanged = JSON.stringify(materialAutomationFields(existing)) !== JSON.stringify(materialAutomationFields(incoming));
  return {
    outcome: automationChanged ? "updated" as const : "unchanged" as const,
    next: {
      ...existing,
      ...incoming,
      automation_review_needed: false,
      automation_last_seen_at: timestamp,
      updated_at: automationChanged ? timestamp : existing.updated_at,
      completed_at: incoming.status === "done" ? existing.completed_at || timestamp : null,
    },
  };
}

function table(name: "work_sources" | "work_items" | "work_item_events") {
  return getSupabaseAdminClient().from(name);
}

async function addAutomationEvent(item: WorkItem, action: "ingested" | "automation_proposed", before: WorkItem | null) {
  const eventId = randomUUID();
  const { error } = await table("work_item_events").insert({
    id: eventId,
    client_id: item.client_id,
    item_id: item.id,
    actor_user_id: null,
    action,
    before_json: before || {},
    after_json: item,
    source_evidence_url: item.completion_evidence_url || item.source_url,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
  return eventId;
}

export async function ingestWorkBatch(value: unknown): Promise<WorkIngestResult> {
  const batch = normalizeWorkIngestBatch(value);
  const workspaceRef = batch.workspaceRef || "";
  const { data: sourceData, error: sourceError } = await table("work_sources")
    .select("*")
    .eq("source_kind", batch.sourceKind)
    .eq("workspace_ref", workspaceRef)
    .eq("source_ref", batch.sourceRef)
    .eq("active", true)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceData) throw new Error("No active Work Manager source mapping matches this automation payload.");
  const source = sourceData as WorkAutomationSource;
  const result: WorkIngestResult = {
    source: { id: source.id, client_id: source.client_id, channel_id: source.channel_id, display_name: source.display_name },
    created: 0,
    updated: 0,
    proposed: 0,
    unchanged: 0,
    items: [],
  };

  for (const item of batch.items) {
    const timestamp = new Date().toISOString();
    const sourceExternalId = createSourceExternalIdentity(source.id, item.externalId);
    const normalized = normalizeWorkItemInput({
      channelId: source.channel_id,
      title: item.title,
      nowText: item.nowText,
      nextText: item.nextText,
      blockerText: item.blockerText,
      ownerName: item.ownerName,
      status: item.status,
      dueDate: item.dueDate,
      sourceKind: source.source_kind,
      sourceUrl: item.sourceUrl,
      sourceExternalId,
      completionEvidenceUrl: item.completionEvidenceUrl,
      clientVisible: item.clientVisible ?? source.default_client_visible,
    });
    const incoming = {
      ...normalized,
      source_snapshot_json: sourceSnapshot(item),
      automation_review_needed: false,
      automation_last_seen_at: timestamp,
      completed_at: normalized.status === "done" ? timestamp : null,
    };
    const { data: existingData, error: existingError } = await table("work_items")
      .select("*")
      .eq("client_id", source.client_id)
      .eq("source_kind", source.source_kind)
      .eq("source_external_id", sourceExternalId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (!existingData) {
      const created: WorkItem = {
        id: randomUUID(),
        client_id: source.client_id,
        ...incoming,
        created_by_user_id: null,
        updated_by_user_id: null,
        created_at: timestamp,
        updated_at: timestamp,
      };
      const { error } = await table("work_items").insert(created);
      if (error) throw error;
      const eventId = await addAutomationEvent(created, "ingested", null);
      await safelyCreateWorkNotifications(created, null, null, eventId);
      result.created += 1;
      result.items.push({ id: created.id, externalId: item.externalId, outcome: "created" });
      continue;
    }

    const existing = existingData as WorkItem;
    const plan = planAutomationUpdate(existing, incoming, timestamp);
    const { error } = await table("work_items").update(plan.next).eq("id", existing.id).eq("client_id", source.client_id);
    if (error) throw error;
    if (plan.outcome === "updated") {
      const eventId = await addAutomationEvent(plan.next, "ingested", existing);
      await safelyCreateWorkNotifications(plan.next, existing, null, eventId);
    }
    if (plan.outcome === "proposed") {
      const eventId = await addAutomationEvent(plan.next, "automation_proposed", existing);
      await safelyCreateWorkNotifications(plan.next, existing, null, eventId);
    }
    result[plan.outcome] += 1;
    result.items.push({ id: existing.id, externalId: item.externalId, outcome: plan.outcome });
  }

  const finishedAt = new Date().toISOString();
  const { error: sourceUpdateError } = await table("work_sources")
    .update({ last_ingested_at: finishedAt, updated_at: finishedAt })
    .eq("id", source.id);
  if (sourceUpdateError) throw sourceUpdateError;
  return result;
}
