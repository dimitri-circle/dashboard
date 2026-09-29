import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/seo/db";
import { type WorkAutomationSource, type WorkItem, type WorkSlackNotificationMode } from "./types";

export type SlackWorkDeliveryKind = "intake" | "activity" | "routed" | "completed" | "blocked";

export function notificationKindForTransition(before: WorkItem | null, after: WorkItem): "completed" | "blocked" | null {
  if (!before || before.status === after.status) return null;
  if (after.status === "done") return "completed";
  if (after.status === "blocked") return "blocked";
  return null;
}

export function allowsSlackNotification(mode: WorkSlackNotificationMode, kind: "completed" | "blocked") {
  return (mode === "completed" && kind === "completed") || mode === "completed_and_blocked";
}

function taskUrl(item: WorkItem) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.WORK_MANAGER_PUBLIC_URL || "https://dashboard-circleclick.vercel.app").replace(/\/$/, "");
  return `${baseUrl}/work-manager/items/${encodeURIComponent(item.id)}`;
}

function originalSlackThreadTs(item: WorkItem) {
  const sourceUrl = item.source_url || "";
  const match = sourceUrl.match(/\/p(\d{16,})/);
  if (!match) return null;
  const digits = match[1];
  return `${digits.slice(0, -6)}.${digits.slice(-6)}`;
}

export function buildSlackWorkUpdate(item: WorkItem, kind: SlackWorkDeliveryKind) {
  const labels: Record<SlackWorkDeliveryKind, string> = {
    intake: "Work added",
    activity: "Work activity updated",
    routed: "Work assigned",
    completed: "Work completed",
    blocked: "Work blocked",
  };
  // Keep Slack replies deliberately terse. The authenticated task link holds
  // the current status, comments, and full activity; comment bodies stay here.
  return `${labels[kind]}: ${taskUrl(item)}`;
}

export async function sendSlackDelivery(source: WorkAutomationSource, item: WorkItem, eventId: string, kind: SlackWorkDeliveryKind, deliveryId: string) {
  const supabase = getSupabaseAdminClient();
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    await supabase.from("work_slack_notification_deliveries").update({ status: "failed", error_text: "SLACK_BOT_TOKEN is not configured.", updated_at: new Date().toISOString() }).eq("id", deliveryId);
    return;
  }
  try {
    const threadTs = originalSlackThreadTs(item) || source.slack_notification_thread_ts || undefined;
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: source.source_ref, text: buildSlackWorkUpdate(item, kind), client_msg_id: eventId, ...(threadTs ? { thread_ts: threadTs } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json() as { ok?: boolean; ts?: string; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error || `Slack returned ${response.status}`);
    await supabase.from("work_slack_notification_deliveries").update({ status: "sent", slack_ts: payload.ts || null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_text: null }).eq("id", deliveryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof TypeError || (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) ? "uncertain" : "failed";
    console.error("Slack work notification failed", message);
    await supabase.from("work_slack_notification_deliveries").update({ status, error_text: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", deliveryId);
  }
}

function sourceIdFromItem(item: WorkItem) {
  const value = item.source_snapshot_json?.sourceId;
  return typeof value === "string" ? value : null;
}

export async function deliverSlackWorkNotification(
  source: WorkAutomationSource | null,
  item: WorkItem,
  before: WorkItem | null,
  eventId: string,
  requestedKind?: SlackWorkDeliveryKind
) {
  const transitionKind = notificationKindForTransition(before, item);
  const kind = requestedKind || transitionKind;
  if (!source || !source.active || source.source_kind !== "slack" || !kind) return;
  const isIntake = kind === "intake";
  const isStatus = kind === "completed" || kind === "blocked";
  if (!isIntake && isStatus && !allowsSlackNotification(source.slack_notification_mode || "never", kind)) return;
  if (!isIntake && !isStatus && !source.slack_activity_notifications_enabled) return;
  // Never turn routine status/comment updates into unsolicited channel posts.
  // Intake commands always carry their originating Slack permalink.
  if (!isIntake && !originalSlackThreadTs(item) && !source.slack_notification_thread_ts) return;

  const supabase = getSupabaseAdminClient();
  const delivery = { id: randomUUID(), source_id: source.id, item_id: item.id, event_id: eventId, kind: isStatus ? kind : isIntake ? "intake" : "activity", status: "pending" };
  const { data: inserted, error: insertError } = await supabase.from("work_slack_notification_deliveries").insert(delivery).select("id").maybeSingle();
  if (insertError) {
    if (insertError.code === "23505") return;
    console.error("Slack work notification ledger insert failed", insertError);
    return;
  }
  if (!inserted) return;

  await sendSlackDelivery(source, item, eventId, kind, inserted.id);
}

export function sourceIdForWorkItem(item: WorkItem) {
  return sourceIdFromItem(item);
}
