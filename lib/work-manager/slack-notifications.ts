import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/seo/db";
import { type WorkAutomationSource, type WorkItem, type WorkSlackNotificationMode } from "./types";

export function notificationKindForTransition(before: WorkItem | null, after: WorkItem): "completed" | "blocked" | null {
  if (!before || before.status === after.status) return null;
  if (after.status === "done") return "completed";
  if (after.status === "blocked") return "blocked";
  return null;
}

export function allowsSlackNotification(mode: WorkSlackNotificationMode, kind: "completed" | "blocked") {
  return (mode === "completed" && kind === "completed") || mode === "completed_and_blocked";
}

export function buildSlackWorkUpdate(item: WorkItem, kind: "completed" | "blocked") {
  const label = kind === "completed" ? "Completed" : "Blocked";
  const due = item.due_date ? ` · due ${item.due_date}` : "";
  const source = item.source_url ? `\nSource: ${item.source_url}` : "";
  return `*Work update: ${label}*\n${item.title}${due}${source}`;
}

function sourceIdFromItem(item: WorkItem) {
  const value = item.source_snapshot_json?.sourceId;
  return typeof value === "string" ? value : null;
}

export async function deliverSlackWorkNotification(source: WorkAutomationSource | null, item: WorkItem, before: WorkItem | null, eventId: string) {
  const kind = notificationKindForTransition(before, item);
  if (!source || source.source_kind !== "slack" || !kind || !allowsSlackNotification(source.slack_notification_mode || "never", kind)) return;
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return;

  const supabase = getSupabaseAdminClient();
  const delivery = { id: randomUUID(), source_id: source.id, item_id: item.id, event_id: eventId, kind, status: "pending" };
  const { data: inserted, error: insertError } = await supabase.from("work_slack_notification_deliveries").insert(delivery).select("id").maybeSingle();
  if (insertError) {
    if (insertError.code === "23505") return;
    console.error("Slack completion notification ledger insert failed", insertError);
    return;
  }
  if (!inserted) return;

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: source.source_ref, text: buildSlackWorkUpdate(item, kind), ...(source.slack_notification_thread_ts ? { thread_ts: source.slack_notification_thread_ts } : {}) }),
    });
    const payload = await response.json() as { ok?: boolean; ts?: string; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error || `Slack returned ${response.status}`);
    await supabase.from("work_slack_notification_deliveries").update({ status: "sent", slack_ts: payload.ts || null, sent_at: new Date().toISOString() }).eq("id", inserted.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Slack completion notification failed", message);
    await supabase.from("work_slack_notification_deliveries").update({ status: "failed", error_text: message.slice(0, 500) }).eq("id", inserted.id);
  }
}

export function sourceIdForWorkItem(item: WorkItem) {
  return sourceIdFromItem(item);
}
