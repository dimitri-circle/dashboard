import { getSupabaseAdminClient } from "@/lib/seo/db";
import { normalizeClientId } from "@/lib/seo/tenant";
import crypto from "node:crypto";
import type { WorkItem, WorkStatus } from "./types";

type MeetingDocItem = {
  id: string;
  title: string;
  ownerName: string;
  dueDate: string;
  status: WorkStatus;
  channelName: string;
  nowText: string;
  nextText: string;
  blockerText: string;
  dismissed: boolean;
};

export function isValidMeetingDocExportRequest(request: Request) {
  const expected = process.env.DASHBOARD_DOC_SYNC_SECRET?.trim() || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (expected.length < 24 || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function toMeetingDocItem(item: WorkItem, channelName: string): MeetingDocItem {
  return {
    id: item.id,
    title: item.title,
    ownerName: item.owner_name || "",
    dueDate: item.due_date || "",
    status: item.status,
    channelName,
    nowText: item.now_text,
    nextText: item.next_text,
    blockerText: item.blocker_text || "",
    dismissed: Boolean(item.dismissed_at),
  };
}

async function meetingDocPayload(clientId: string) {
  const id = normalizeClientId(clientId);
  const db = getSupabaseAdminClient();
  const [{ data: client, error: clientError }, { data: channels, error: channelError }, { data: items, error: itemError }] =
    await Promise.all([
      db.from("seo_clients").select("id,name").eq("id", id).maybeSingle(),
      db.from("work_channels").select("id,name").eq("client_id", id).eq("active", true),
      db.from("work_items").select("*").eq("client_id", id).order("updated_at", { ascending: false }).limit(100),
    ]);

  if (clientError) throw clientError;
  if (channelError) throw channelError;
  if (itemError) throw itemError;
  if (!client) throw new Error("Client workspace is unavailable.");

  const channelNames = new Map((channels || []).map((channel) => [channel.id, channel.name]));
  return {
    clientKey: client.name,
    items: ((items || []) as WorkItem[]).map((item) => toMeetingDocItem(item, channelNames.get(item.channel_id) || "Work")),
  };
}

export async function meetingDocPayloadByClientKey(clientKey: string) {
  const normalized = clientKey.trim().toLowerCase();
  if (!normalized || normalized.length > 80) throw new Error("Client key is required.");
  const { data, error } = await getSupabaseAdminClient().from("seo_clients").select("id,name");
  if (error) throw error;
  const client = (data || []).find((row) => String(row.name || "").trim().toLowerCase() === normalized);
  if (!client) throw new Error("Client workspace is unavailable.");
  return meetingDocPayload(client.id);
}
