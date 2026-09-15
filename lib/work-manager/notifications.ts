import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/seo/db";
import type { WorkItem, WorkNotification, WorkNotificationKind, WorkNotificationPreferences } from "./types";

export const WORK_NOTIFICATIONS_ENABLED = process.env.WORK_NOTIFICATIONS_ENABLED !== "false";

export function notificationReason(kind: WorkNotificationKind, item: Pick<WorkItem, "title" | "blocker_text">) {
  if (kind === "assigned") return `You now own “${item.title}”.`;
  if (kind === "blocked") return item.blocker_text ? `Blocked: ${item.blocker_text}` : "This work is blocked and needs attention.";
  if (kind === "review_needed") return "A source suggested a change to a human-edited update.";
  if (kind === "due_soon") return "This work is due soon.";
  if (kind === "overdue") return "This work is overdue.";
  if (kind === "channel_intake") return "New work was added to a channel you follow.";
  return "A task you follow changed.";
}

export function plannedNotificationKinds(before: WorkItem | null, after: WorkItem) {
  const kinds: WorkNotificationKind[] = [];
  if (after.owner_user_id && before?.owner_user_id !== after.owner_user_id) kinds.push("assigned");
  if (after.status === "blocked" && before?.status !== "blocked") kinds.push("blocked");
  if (after.automation_review_needed && !before?.automation_review_needed) kinds.push("review_needed");
  return kinds;
}

function table(name: "work_notifications" | "work_notification_preferences" | "work_notification_subscriptions" | "work_channels" | "seo_clients" | "seo_app_users") {
  return getSupabaseAdminClient().from(name);
}

export async function createWorkNotifications(item: WorkItem, before: WorkItem | null, actorUserId: string | null, eventId: string) {
  if (!WORK_NOTIFICATIONS_ENABLED) return [];
  const recipients = new Map<string, Set<WorkNotificationKind>>();
  for (const kind of plannedNotificationKinds(before, item)) {
    if (item.owner_user_id && item.owner_user_id !== actorUserId) {
      if (!recipients.has(item.owner_user_id)) recipients.set(item.owner_user_id, new Set());
      recipients.get(item.owner_user_id)!.add(kind);
    }
  }
  const { data: subscriptions, error: subscriptionError } = await table("work_notification_subscriptions")
    .select("user_id,channel_id,item_id")
    .eq("client_id", item.client_id);
  if (subscriptionError) throw subscriptionError;
  for (const subscription of subscriptions || []) {
    if (subscription.user_id === actorUserId) continue;
    if (subscription.item_id === item.id || subscription.channel_id === item.channel_id) {
      if (!recipients.has(subscription.user_id)) recipients.set(subscription.user_id, new Set());
      recipients.get(subscription.user_id)!.add(subscription.channel_id === item.channel_id && !before ? "channel_intake" : "watched_changed");
    }
  }
  const { data: activeUsers, error: userError } = await table("seo_app_users").select("id").is("disabled_at", null);
  if (userError) throw userError;
  const activeIds = new Set((activeUsers || []).map((user) => user.id));
  const createdAt = new Date().toISOString();
  const notifications = Array.from(recipients).flatMap(([recipient, kinds]) => Array.from(kinds).map((kind) => ({
    id: randomUUID(), recipient_user_id: recipient, client_id: item.client_id, channel_id: item.channel_id,
    item_id: item.id, event_id: eventId, kind, title: item.title, message: notificationReason(kind, item),
    dedupe_key: `${eventId}:${kind}`, read_at: null, created_at: createdAt,
  }))).filter((notification) => activeIds.has(notification.recipient_user_id));
  if (!notifications.length) return [];
  const { error } = await table("work_notifications").upsert(notifications, { onConflict: "recipient_user_id,dedupe_key", ignoreDuplicates: true });
  if (error) throw error;
  return notifications;
}

export async function safelyCreateWorkNotifications(item: WorkItem, before: WorkItem | null, actorUserId: string | null, eventId: string) {
  try {
    return await createWorkNotifications(item, before, actorUserId, eventId);
  } catch (error) {
    console.error("Work notification creation failed after the task event was saved.", error);
    return [];
  }
}

export async function listWorkNotifications(userId: string) {
  if (!WORK_NOTIFICATIONS_ENABLED) return [];
  const { data, error } = await table("work_notifications").select("*").eq("recipient_user_id", userId).order("created_at", { ascending: false }).limit(80);
  if (error) throw error;
  const notifications = (data || []) as WorkNotification[];
  const clientIds = [...new Set(notifications.map((item) => item.client_id))];
  const channelIds = [...new Set(notifications.map((item) => item.channel_id))];
  const [{ data: clients }, { data: channels }] = await Promise.all([
    clientIds.length ? table("seo_clients").select("id,name").in("id", clientIds) : Promise.resolve({ data: [] }),
    channelIds.length ? table("work_channels").select("id,name,slug").in("id", channelIds) : Promise.resolve({ data: [] }),
  ]);
  const clientMap = new Map((clients || []).map((value) => [value.id, value.name]));
  const channelMap = new Map((channels || []).map((value) => [value.id, value]));
  return notifications.map((notification) => ({ ...notification, client_name: clientMap.get(notification.client_id), channel_name: channelMap.get(notification.channel_id)?.name, channel_slug: channelMap.get(notification.channel_id)?.slug }));
}

export async function markWorkNotificationsRead(userId: string, ids?: string[]) {
  let query = table("work_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_user_id", userId).is("read_at", null);
  if (ids?.length) query = query.in("id", ids.slice(0, 80));
  const { error } = await query;
  if (error) throw error;
}

export async function getWorkNotificationPreferences(userId: string): Promise<WorkNotificationPreferences> {
  const { data, error } = await table("work_notification_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data || { user_id: userId, email_enabled: false, digest_hour: 17, timezone: "America/Chicago", assigned_enabled: true, blocked_enabled: true, review_enabled: true, due_enabled: true, channel_intake_enabled: false, updated_at: new Date().toISOString() }) as WorkNotificationPreferences;
}

export async function saveWorkNotificationPreferences(userId: string, payload: Partial<WorkNotificationPreferences>) {
  const current = await getWorkNotificationPreferences(userId);
  const next = { ...current, email_enabled: payload.email_enabled === true, assigned_enabled: payload.assigned_enabled !== false, blocked_enabled: payload.blocked_enabled !== false, review_enabled: payload.review_enabled !== false, due_enabled: payload.due_enabled !== false, channel_intake_enabled: payload.channel_intake_enabled === true, digest_hour: Number.isInteger(payload.digest_hour) ? Math.max(0, Math.min(23, Number(payload.digest_hour))) : current.digest_hour, timezone: payload.timezone === "America/Chicago" ? payload.timezone : current.timezone, updated_at: new Date().toISOString() };
  const { error } = await table("work_notification_preferences").upsert(next, { onConflict: "user_id" });
  if (error) throw error;
  return next;
}
