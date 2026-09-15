import crypto, { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/seo/db";
import { normalizeClientId } from "@/lib/seo/tenant";
import {
  WORK_SOURCE_KINDS,
  WORK_STATUSES,
  type WorkAutomationSource,
  type WorkChannel,
  type WorkItem,
  type WorkReviewLink,
  type WorkReviewSnapshot,
  type WorkSourceKind,
  type WorkStatus,
} from "./types";

const WORK_STORAGE_MESSAGE =
  "Work Manager storage is not installed yet. Apply the reviewed Work Manager migrations to the confirmed CircleClick Supabase project.";

type WorkItemInput = Partial<{
  channelId: unknown;
  title: unknown;
  nowText: unknown;
  nextText: unknown;
  blockerText: unknown;
  ownerName: unknown;
  status: unknown;
  dueDate: unknown;
  sourceKind: unknown;
  sourceUrl: unknown;
  sourceExternalId: unknown;
  completionEvidenceUrl: unknown;
  clientVisible: unknown;
}>;

function asText(value: unknown, maximumLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function asNullableText(value: unknown, maximumLength: number) {
  return asText(value, maximumLength) || null;
}

function asHttpUrl(value: unknown) {
  const raw = asText(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Only HTTP and HTTPS evidence links are supported.");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Only HTTP")) throw error;
    throw new Error("Evidence links must be valid HTTP or HTTPS URLs.");
  }
}

function asStatus(value: unknown, fallback: WorkStatus = "new"): WorkStatus {
  return typeof value === "string" && WORK_STATUSES.includes(value as WorkStatus) ? (value as WorkStatus) : fallback;
}

function asSourceKind(value: unknown, fallback: WorkSourceKind = "manual"): WorkSourceKind {
  return typeof value === "string" && WORK_SOURCE_KINDS.includes(value as WorkSourceKind)
    ? (value as WorkSourceKind)
    : fallback;
}

function asDate(value: unknown) {
  const raw = asText(value, 10);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw new Error("Due date must use YYYY-MM-DD.");
  }
  return raw;
}

export function slugifyWorkChannel(value: unknown) {
  const slug = asText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  if (!slug) throw new Error("Channel name is required.");
  return slug;
}

export function hashReviewToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createReviewToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function normalizeWorkItemInput(payload: WorkItemInput, existing?: WorkItem) {
  const status = asStatus(payload.status, existing?.status || "new");
  const completionEvidenceUrl =
    payload.completionEvidenceUrl === undefined
      ? existing?.completion_evidence_url || null
      : asHttpUrl(payload.completionEvidenceUrl);

  if (status === "done" && !completionEvidenceUrl) {
    throw new Error("Completion evidence is required before work can be marked Done.");
  }

  const blockerText = payload.blockerText === undefined ? existing?.blocker_text || null : asNullableText(payload.blockerText, 1600);
  if (status === "blocked" && !blockerText) {
    throw new Error("Describe the blocker before marking work Blocked.");
  }

  const title = payload.title === undefined ? existing?.title || "" : asText(payload.title, 180);
  const channelId = payload.channelId === undefined ? existing?.channel_id || "" : asText(payload.channelId, 80);
  if (!title) throw new Error("Work title is required.");
  if (!channelId) throw new Error("Choose a channel for this work.");

  return {
    channel_id: channelId,
    title,
    now_text: payload.nowText === undefined ? existing?.now_text || "" : asText(payload.nowText, 2400),
    next_text: payload.nextText === undefined ? existing?.next_text || "" : asText(payload.nextText, 2400),
    blocker_text: blockerText,
    owner_name: payload.ownerName === undefined ? existing?.owner_name || null : asNullableText(payload.ownerName, 120),
    status,
    due_date: payload.dueDate === undefined ? existing?.due_date || null : asDate(payload.dueDate),
    source_kind: asSourceKind(payload.sourceKind, existing?.source_kind || "manual"),
    source_url: payload.sourceUrl === undefined ? existing?.source_url || null : asHttpUrl(payload.sourceUrl),
    source_external_id:
      payload.sourceExternalId === undefined
        ? existing?.source_external_id || null
        : asNullableText(payload.sourceExternalId, 220),
    completion_evidence_url: completionEvidenceUrl,
    client_visible:
      typeof payload.clientVisible === "boolean" ? payload.clientVisible : existing?.client_visible ?? true,
  };
}

function workStorageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/work_(channels|items|item_events|review_links|sources).*does not exist|schema cache/i.test(message)) {
    return new Error(WORK_STORAGE_MESSAGE);
  }
  return error instanceof Error ? error : new Error(message);
}

function table(name: "work_channels" | "work_items" | "work_item_events" | "work_review_links" | "work_sources" | "seo_clients") {
  return getSupabaseAdminClient().from(name);
}

export async function listWorkSources(clientId: string) {
  try {
    const id = normalizeClientId(clientId);
    const { data, error } = await table("work_sources")
      .select("*")
      .eq("client_id", id)
      .order("display_name", { ascending: true });
    if (error) throw error;
    return (data || []) as WorkAutomationSource[];
  } catch (error) {
    throw workStorageError(error);
  }
}

export async function createWorkSource(clientId: string, actorUserId: string, payload: Record<string, unknown>) {
  try {
    const id = normalizeClientId(clientId);
    const sourceKind = asText(payload.sourceKind, 40);
    if (sourceKind !== "slack" && sourceKind !== "google_meet") {
      throw new Error("Source type must be Slack or Google Meet.");
    }
    const channelId = asText(payload.channelId, 80);
    const sourceRef = asText(payload.sourceRef, 220);
    const workspaceRef = asText(payload.workspaceRef, 220);
    const displayName = asText(payload.displayName, 120);
    if (!channelId) throw new Error("Choose the destination channel.");
    if (!sourceRef) throw new Error("Source reference is required.");
    if (!displayName) throw new Error("Source name is required.");
    await ensureChannelBelongsToClient(channelId, id);

    const timestamp = new Date().toISOString();
    const source: WorkAutomationSource = {
      id: randomUUID(),
      client_id: id,
      channel_id: channelId,
      source_kind: sourceKind,
      workspace_ref: workspaceRef,
      source_ref: sourceRef,
      display_name: displayName,
      active: true,
      default_client_visible: payload.defaultClientVisible === true,
      last_ingested_at: null,
      created_by_user_id: actorUserId,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const { error } = await table("work_sources").insert(source);
    if (error) throw error;
    return source;
  } catch (error) {
    throw workStorageError(error);
  }
}

export async function listWorkChannels(clientId: string) {
  try {
    const id = normalizeClientId(clientId);
    const { data, error } = await table("work_channels")
      .select("*")
      .eq("client_id", id)
      .eq("active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data || []) as WorkChannel[];
  } catch (error) {
    throw workStorageError(error);
  }
}

export async function createWorkChannel(clientId: string, actorUserId: string, payload: Record<string, unknown>) {
  try {
    const id = normalizeClientId(clientId);
    const name = asText(payload.name, 80);
    if (!name) throw new Error("Channel name is required.");
    const timestamp = new Date().toISOString();
    const channel: WorkChannel = {
      id: randomUUID(),
      client_id: id,
      name,
      slug: slugifyWorkChannel(payload.slug || name),
      description: asNullableText(payload.description, 400),
      source_kind: asSourceKind(payload.sourceKind),
      external_ref: asNullableText(payload.externalRef, 220),
      active: true,
      created_by_user_id: actorUserId,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const { error } = await table("work_channels").insert(channel);
    if (error) throw error;
    return channel;
  } catch (error) {
    throw workStorageError(error);
  }
}

export async function listWorkItems(clientId: string, channelId?: string | null) {
  try {
    const id = normalizeClientId(clientId);
    let query = table("work_items").select("*").eq("client_id", id).order("updated_at", { ascending: false });
    if (channelId) query = query.eq("channel_id", channelId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as WorkItem[];
  } catch (error) {
    throw workStorageError(error);
  }
}

async function ensureChannelBelongsToClient(channelId: string, clientId: string) {
  const { data, error } = await table("work_channels")
    .select("id")
    .eq("id", channelId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Channel does not belong to the selected client.");
}

async function addWorkEvent(
  item: WorkItem,
  actorUserId: string,
  action: "created" | "updated" | "status_changed" | "evidence_added",
  before: Partial<WorkItem> | null
) {
  const { error } = await table("work_item_events").insert({
    id: randomUUID(),
    client_id: item.client_id,
    item_id: item.id,
    actor_user_id: actorUserId,
    action,
    before_json: before || {},
    after_json: item,
    source_evidence_url: item.completion_evidence_url || item.source_url,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function createWorkItem(clientId: string, actorUserId: string, payload: WorkItemInput) {
  try {
    const id = normalizeClientId(clientId);
    const input = normalizeWorkItemInput(payload);
    await ensureChannelBelongsToClient(input.channel_id, id);
    const timestamp = new Date().toISOString();
    const item: WorkItem = {
      id: randomUUID(),
      client_id: id,
      ...input,
      source_snapshot_json: {},
      automation_review_needed: false,
      automation_last_seen_at: null,
      created_by_user_id: actorUserId,
      updated_by_user_id: actorUserId,
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: input.status === "done" ? timestamp : null,
    };
    const { error } = await table("work_items").insert(item);
    if (error) throw error;
    await addWorkEvent(item, actorUserId, "created", null);
    return item;
  } catch (error) {
    throw workStorageError(error);
  }
}

export async function updateWorkItem(clientId: string, itemId: string, actorUserId: string, payload: WorkItemInput) {
  try {
    const id = normalizeClientId(clientId);
    const { data, error } = await table("work_items").select("*").eq("id", itemId).eq("client_id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Work item not found in the selected client.");
    const existing = data as WorkItem;
    const input = normalizeWorkItemInput(payload, existing);
    await ensureChannelBelongsToClient(input.channel_id, id);
    const timestamp = new Date().toISOString();
    const next: WorkItem = {
      ...existing,
      ...input,
      updated_by_user_id: actorUserId,
      automation_review_needed: false,
      updated_at: timestamp,
      completed_at: input.status === "done" ? existing.completed_at || timestamp : null,
    };
    const { error: updateError } = await table("work_items").update(next).eq("id", itemId).eq("client_id", id);
    if (updateError) throw updateError;
    const action = existing.status !== next.status
      ? "status_changed"
      : !existing.completion_evidence_url && next.completion_evidence_url
        ? "evidence_added"
        : "updated";
    await addWorkEvent(next, actorUserId, action, existing);
    return next;
  } catch (error) {
    throw workStorageError(error);
  }
}

export async function createWorkReviewLink(
  clientId: string,
  actorUserId: string,
  payload: { channelId?: unknown; label?: unknown; expiresAt?: unknown }
) {
  try {
    const id = normalizeClientId(clientId);
    const channelId = asNullableText(payload.channelId, 80);
    if (channelId) await ensureChannelBelongsToClient(channelId, id);
    const label = asText(payload.label, 120) || "Client work review";
    const expiresRaw = asText(payload.expiresAt, 40);
    const expiresTimestamp = expiresRaw ? Date.parse(expiresRaw) : null;
    if (expiresTimestamp !== null && Number.isNaN(expiresTimestamp)) throw new Error("Review link expiry is invalid.");
    if (expiresTimestamp !== null && expiresTimestamp <= Date.now()) throw new Error("Review link expiry must be in the future.");
    const expiresAt = expiresTimestamp === null ? null : new Date(expiresTimestamp).toISOString();
    const token = createReviewToken();
    const link: WorkReviewLink & { token_hash: string; created_by_user_id: string } = {
      id: randomUUID(),
      client_id: id,
      channel_id: channelId,
      label,
      token_hash: hashReviewToken(token),
      created_by_user_id: actorUserId,
      expires_at: expiresAt,
      revoked_at: null,
      created_at: new Date().toISOString(),
    };
    const { error } = await table("work_review_links").insert(link);
    if (error) throw error;
    const { token_hash: _tokenHash, created_by_user_id: _createdBy, ...safeLink } = link;
    return { link: safeLink, token };
  } catch (error) {
    throw workStorageError(error);
  }
}

export async function revokeWorkReviewLink(clientId: string, linkId: string) {
  try {
    const id = normalizeClientId(clientId);
    const revokedAt = new Date().toISOString();
    const { data, error } = await table("work_review_links")
      .update({ revoked_at: revokedAt })
      .eq("id", linkId)
      .eq("client_id", id)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Active review link not found.");
    return { id: linkId, revoked_at: revokedAt };
  } catch (error) {
    throw workStorageError(error);
  }
}

export async function getWorkReviewSnapshot(token: string): Promise<WorkReviewSnapshot> {
  try {
    if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) throw new Error("Review link is invalid.");
    const tokenHash = hashReviewToken(token);
    const { data: linkData, error: linkError } = await table("work_review_links")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!linkData || linkData.revoked_at) throw new Error("Review link is unavailable.");
    if (linkData.expires_at && Date.parse(linkData.expires_at) <= Date.now()) {
      throw new Error("Review link has expired.");
    }

    const [{ data: client, error: clientError }, { data: channels, error: channelError }] = await Promise.all([
      table("seo_clients").select("id,name").eq("id", linkData.client_id).maybeSingle(),
      table("work_channels").select("id,name,slug,description").eq("client_id", linkData.client_id).eq("active", true),
    ]);
    if (clientError) throw clientError;
    if (channelError) throw channelError;
    if (!client) throw new Error("Client workspace is unavailable.");

    let itemQuery = table("work_items")
      .select("id,channel_id,title,now_text,next_text,blocker_text,owner_name,status,due_date,source_url,completion_evidence_url,updated_at")
      .eq("client_id", linkData.client_id)
      .eq("client_visible", true)
      .order("updated_at", { ascending: false });
    if (linkData.channel_id) itemQuery = itemQuery.eq("channel_id", linkData.channel_id);
    const { data: items, error: itemError } = await itemQuery;
    if (itemError) throw itemError;
    const channelById = new Map((channels || []).map((channel) => [channel.id, channel]));
    const selectedChannel = linkData.channel_id ? channelById.get(linkData.channel_id) || null : null;

    return {
      client: client as { id: string; name: string },
      channel: selectedChannel,
      label: linkData.label,
      generated_at: new Date().toISOString(),
      items: (items || []).map((item) => ({
        ...item,
        channel_name: channelById.get(item.channel_id)?.name || "Work",
      })) as WorkReviewSnapshot["items"],
    };
  } catch (error) {
    throw workStorageError(error);
  }
}

export function isWorkStorageNotReady(error: unknown) {
  return error instanceof Error && error.message === WORK_STORAGE_MESSAGE;
}
