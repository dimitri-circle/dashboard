import { getSupabaseAdminClient } from "@/lib/seo/db";
import { extractDueDate } from "./due-dates";
import { intakeSlackCandidates } from "./intake";
import { sendSlackIntakePrompt } from "./slack-intake-prompts";
import { parseSlackCommand } from "./slack-events";
import { replyWithSlackClientStatus } from "./slack-status";

const PROCESSING_LEASE_MS = 2 * 60 * 1000;

type Draft = {
  source_id: string;
  external_id: string;
  thread_ts: string;
  user_ref: string;
  source_url: string;
  command_kind: "add" | "status";
  assembled_text: string;
  last_reply_external_id: string | null;
  revision: number;
  state: "pending" | "processing" | "completed";
  expires_at: string;
  updated_at: string;
};

type ThreadMessage = {
  workspaceRef: string;
  channelId: string;
  externalId: string;
  threadTs: string;
  userRef: string;
  text: string;
  sourceUrl: string;
};

export function canonicalizeSlackDraftText(value: string, now = new Date()) {
  const parsed = extractDueDate(value, now);
  const clean = parsed.text.replace(/\bby\s+(?:tomorrow|today|soon)\b/gi, " ").replace(/\s+/g, " ").trim();
  return `${clean}${parsed.dueDate ? ` due:${parsed.dueDate}` : ""}`.trim();
}

export function mergeSlackTaskReply(original: string, reply: string, now = new Date()) {
  if (reply.trim().toLowerCase() === "retry") return original;
  const replacement = parseSlackCommand(reply);
  if (replacement?.kind === "add") return canonicalizeSlackDraftText(reply.trim(), now).slice(0, 3000);
  const previous = extractDueDate(original, now);
  const correction = extractDueDate(reply, now);
  const dateRequested = /\bby\b|\bdue\s*:/i.test(reply);
  const dueDate = correction.dueDate || (!dateRequested ? previous.dueDate : "");
  return `${previous.text} ${correction.text}${dueDate ? ` due:${dueDate}` : ""}`.replace(/\s+/g, " ").trim().slice(0, 3000);
}

export function mergeSlackStatusReply(original: string, reply: string, now = new Date()) {
  if (reply.trim().toLowerCase() === "retry") return original;
  const replacement = parseSlackCommand(reply);
  if (replacement?.kind === "status") return canonicalizeSlackDraftText(replacement.argument, now);
  const previous = extractDueDate(original, now);
  const correction = extractDueDate(reply, now);
  const clientName = correction.text.trim() || previous.text.trim();
  const dateRequested = /\bby\b|\bdue\s*:/i.test(reply);
  const dueDate = correction.dueDate || (!dateRequested ? previous.dueDate : "");
  return `${clientName}${dueDate ? ` due:${dueDate}` : ""}`.trim().slice(0, 3000);
}

async function pruneExpiredDrafts() {
  const { error } = await getSupabaseAdminClient().from("work_slack_command_drafts")
    .delete().lt("expires_at", new Date().toISOString());
  if (error) throw error;
}

async function requireSlackReply(input: Parameters<typeof sendSlackIntakePrompt>[0]) {
  const result = await sendSlackIntakePrompt(input);
  if (result.outcome === "failed" || result.outcome === "uncertain") {
    throw new Error(`Slack thread reply delivery ${result.outcome}.`);
  }
  return result;
}

export async function rememberMissingSlackTask(input: ThreadMessage & { sourceId: string; promptText: string }) {
  await pruneExpiredDrafts();
  const db = getSupabaseAdminClient();
  const { error } = await db.from("work_slack_command_drafts").insert({
    source_id: input.sourceId,
    external_id: input.externalId,
    thread_ts: input.threadTs,
    user_ref: input.userRef,
    source_url: input.sourceUrl,
    command_kind: "add",
    assembled_text: canonicalizeSlackDraftText(input.text),
  });
  if (error && error.code !== "23505") throw error;
  return requireSlackReply({
    sourceId: input.sourceId,
    channelId: input.channelId,
    externalId: input.externalId,
    threadTs: input.threadTs,
    text: input.promptText,
  });
}

export async function rememberMissingSlackStatus(input: ThreadMessage & { sourceId: string }) {
  await pruneExpiredDrafts();
  const { error } = await getSupabaseAdminClient().from("work_slack_command_drafts").insert({
    source_id: input.sourceId,
    external_id: input.externalId,
    thread_ts: input.threadTs,
    user_ref: input.userRef,
    source_url: input.sourceUrl,
    command_kind: "status",
    assembled_text: canonicalizeSlackDraftText(parseSlackCommand(input.text)?.argument || ""),
  });
  if (error && error.code !== "23505") throw error;
}

export async function tryCompleteSlackTaskThread(input: ThreadMessage) {
  if (!input.threadTs || input.threadTs === input.externalId) return false;
  await pruneExpiredDrafts();
  const db = getSupabaseAdminClient();
  const { data: source, error: sourceError } = await db.from("work_sources")
    .select("id")
    .eq("source_kind", "slack")
    .eq("workspace_ref", input.workspaceRef)
    .eq("source_ref", input.channelId)
    .eq("active", true)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!source) return false;

  const sourceId = String(source.id);
  const { data, error } = await db.from("work_slack_command_drafts")
    .select("source_id,external_id,thread_ts,user_ref,source_url,command_kind,assembled_text,last_reply_external_id,revision,state,expires_at,updated_at")
    .eq("source_id", sourceId)
    .eq("thread_ts", input.threadTs)
    .eq("user_ref", input.userRef)
    .neq("state", "completed")
    .limit(2);
  if (error) throw error;
  if (!data?.length) return false;
  if (data.length > 1) {
    await requireSlackReply({ sourceId, channelId: input.channelId, externalId: input.externalId,
      threadTs: input.threadTs, text: "This thread has more than one unfinished command. Please start a new top-level command so I do not change the wrong one." });
    return true;
  }
  const draft = data[0] as Draft;
  const newCommand = parseSlackCommand(input.text);
  if (newCommand && newCommand.kind !== "help" && newCommand.kind !== draft.command_kind) return false;
  if (draft.last_reply_external_id === input.externalId) return true;
  if (new Date(draft.expires_at).getTime() <= Date.now()) {
    await requireSlackReply({ sourceId, channelId: input.channelId, externalId: input.externalId,
      threadTs: input.threadTs, text: "This request expired. Please start a new command." });
    return true;
  }
  const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS).toISOString();
  if (draft.state === "processing" && draft.updated_at >= staleBefore) {
    await requireSlackReply({ sourceId, channelId: input.channelId, externalId: input.externalId,
      threadTs: input.threadTs, text: "I am still handling the previous reply. Please reply `retry` here shortly if the result does not appear." });
    return true;
  }

  const assembledText = draft.command_kind === "status"
    ? mergeSlackStatusReply(draft.assembled_text, input.text)
    : mergeSlackTaskReply(draft.assembled_text, input.text);
  const revision = draft.revision + 1;
  let claimQuery = db.from("work_slack_command_drafts")
    .update({ assembled_text: assembledText, last_reply_external_id: input.externalId,
      revision, state: "processing", updated_at: new Date().toISOString() })
    .eq("source_id", sourceId)
    .eq("external_id", draft.external_id)
    .eq("revision", draft.revision)
    .eq("state", draft.state);
  if (draft.state === "processing") claimQuery = claimQuery.lt("updated_at", staleBefore);
  const { data: claimed, error: claimError } = await claimQuery.select("external_id").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return true;

  try {
    if (draft.command_kind === "status") {
      const delivery = await replyWithSlackClientStatus({ workspaceRef: input.workspaceRef,
        channelId: input.channelId, externalId: input.externalId,
        threadTs: draft.external_id, clientName: assembledText });
      if (delivery.outcome === "failed" || delivery.outcome === "uncertain") {
        throw new Error(`Slack status reply delivery ${delivery.outcome}.`);
      }
      const nextState = delivery.needsInfo ? "pending" : "completed";
      const { error: statusError } = await db.from("work_slack_command_drafts")
        .update({ state: nextState, completed_at: delivery.needsInfo ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("source_id", sourceId).eq("external_id", draft.external_id).eq("revision", revision).eq("state", "processing");
      if (statusError) throw statusError;
      return true;
    }
    const result = await intakeSlackCandidates({ workspaceRef: input.workspaceRef, sourceRef: input.channelId,
      messages: [{ externalId: draft.external_id, text: assembledText, sourceUrl: draft.source_url,
        threadTs: draft.external_id, tagged: true }] });
    const needsInfo = result.needsInfo[0];
    if (needsInfo) {
      const { data: released, error: releaseError } = await db.from("work_slack_command_drafts")
        .update({ state: "pending", updated_at: new Date().toISOString() })
        .eq("source_id", sourceId).eq("external_id", draft.external_id).eq("revision", revision).eq("state", "processing")
        .select("external_id").maybeSingle();
      if (releaseError) throw releaseError;
      if (!released) return true;
      await requireSlackReply({ sourceId, channelId: input.channelId, externalId: input.externalId,
        threadTs: draft.external_id, text: needsInfo.promptText });
      return true;
    }
    if (!result.result?.items.length) throw new Error("The completed Slack draft produced no task.");
    const ingested = result.result.items[0];
    if (ingested.outcome !== "created") {
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.WORK_MANAGER_PUBLIC_URL || "https://dashboard-circleclick.vercel.app").replace(/\/$/, "");
      const label = ingested.outcome === "dismissed" ? "This work was dismissed earlier" : "Work already added";
      await requireSlackReply({ sourceId, channelId: input.channelId, externalId: input.externalId,
        threadTs: draft.external_id, text: `${label}: ${baseUrl}/work-manager/items/${encodeURIComponent(ingested.id)}` });
    }
    const { error: completedError } = await db.from("work_slack_command_drafts")
      .update({ state: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("source_id", sourceId).eq("external_id", draft.external_id).eq("revision", revision).eq("state", "processing")
      .select("external_id").maybeSingle();
    if (completedError) throw completedError;
    return true;
  } catch (error) {
    await db.from("work_slack_command_drafts")
      .update({ state: "pending", updated_at: new Date().toISOString() })
      .eq("source_id", sourceId).eq("external_id", draft.external_id).eq("revision", revision).eq("state", "processing");
    throw error;
  }
}
