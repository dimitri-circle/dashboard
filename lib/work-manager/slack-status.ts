import { getSupabaseAdminClient } from "@/lib/seo/db";
import { extractDueDate } from "./due-dates";
import { sendSlackIntakePrompt } from "./slack-intake-prompts";

type Client = { id: string; name: string };
type VisibleItem = { id: string; title: string; status: string; workflow_stage?: string | null; due_date: string | null };

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slackText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function resolveStatusClient(argument: string, clients: Client[]) {
  const name = normalizedName(argument);
  return name ? clients.filter((client) => normalizedName(client.name) === name) : [];
}

export function parseStatusQuery(argument: string, now = new Date()) {
  const parsed = extractDueDate(argument.trim(), now);
  const dateRequested = /\bby\b|\bdue\s*:/i.test(argument);
  return {
    clientName: parsed.text.trim(),
    dueOnOrBefore: parsed.dueDate || null,
    invalidDate: parsed.reviewNeeded || (dateRequested && !parsed.dueDate),
  };
}

export function formatSlackTaskHelp() {
  return "*Work Manager commands*\n• Add work: `@task-add Fix pricing page for VAST by Friday`\n• Check shared work: `@task-status VAST` or `@task-status VAST by Friday` (due on or before Friday)\nReply in the same thread if the bot asks for a missing client or date. Internal tasks stay private.";
}

export function formatSlackStatus(clientName: string, items: VisibleItem[], total: number, dueOnOrBefore?: string | null) {
  const scope = dueOnOrBefore ? ` due on or before ${dueOnOrBefore}` : "";
  if (!total) return `${slackText(clientName)}: no client-visible work${scope} is currently shared. Internal tasks are not shown.`;
  const lines = items.map((item) => {
    const stage = item.status === "blocked" ? "Blocked"
      : item.status === "needs_evidence" ? "Proof needed"
      : item.status === "unknown" ? "Needs clarification"
      : item.workflow_stage === "client_review" ? "Client review"
      : item.workflow_stage === "in_progress" || item.status === "in_progress" ? "In progress"
      : item.workflow_stage === "done" || item.status === "done" ? "Done" : "Ready";
    const due = item.due_date ? ` · due ${item.due_date}` : "";
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.WORK_MANAGER_PUBLIC_URL || "https://dashboard-circleclick.vercel.app").replace(/\/$/, "");
    return `• ${slackText(item.title)} — ${stage}${due}\n  ${baseUrl}/work-manager/items/${encodeURIComponent(item.id)}`;
  });
  return `${slackText(clientName)}: ${total} client-visible task${total === 1 ? "" : "s"}${scope}${total > items.length ? ` (latest ${items.length} shown)` : ""}.\n${lines.join("\n")}`;
}

export async function replyWithSlackTaskHelp(input: {
  workspaceRef: string;
  channelId: string;
  externalId: string;
  threadTs: string;
}) {
  const db = getSupabaseAdminClient();
  const { data, error } = await db.from("work_sources").select("id")
    .eq("source_kind", "slack").eq("workspace_ref", input.workspaceRef)
    .eq("source_ref", input.channelId).eq("active", true).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No active Work Manager source mapping matches this Slack channel.");
  return sendSlackIntakePrompt({ sourceId: String(data.id), channelId: input.channelId,
    externalId: input.externalId, threadTs: input.threadTs, text: formatSlackTaskHelp() });
}

export async function replyWithSlackClientStatus(input: {
  workspaceRef: string;
  channelId: string;
  externalId: string;
  threadTs: string;
  clientName: string;
}) {
  const db = getSupabaseAdminClient();
  const [sourceResult, clientResult] = await Promise.all([
    db.from("work_sources").select("id").eq("source_kind", "slack").eq("workspace_ref", input.workspaceRef).eq("source_ref", input.channelId).eq("active", true).maybeSingle(),
    db.from("seo_clients").select("id,name"),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (!sourceResult.data) throw new Error("No active Work Manager source mapping matches this Slack channel.");
  if (clientResult.error) throw clientResult.error;
  const clients = (clientResult.data || []) as Client[];
  const query = parseStatusQuery(input.clientName);
  const matches = resolveStatusClient(query.clientName, clients);
  let reply: string;
  if (query.invalidDate) {
    reply = "Please reply in this thread with a clear date, such as `by Friday` or `by 2026-10-02`; no need to repeat the command.";
  } else if (matches.length !== 1) {
    reply = "Please reply in this thread with one exact client name. Example: `VAST` or `VAST by Friday`.";
  } else {
    let itemsQuery = db.from("work_items")
      .select("id,title,status,workflow_stage,due_date", { count: "exact" })
      .eq("client_id", matches[0].id)
      .eq("client_visible", true)
      .is("dismissed_at", null);
    if (query.dueOnOrBefore) itemsQuery = itemsQuery.lte("due_date", query.dueOnOrBefore);
    const { data, count, error } = await itemsQuery
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    reply = formatSlackStatus(matches[0].name, (data || []) as VisibleItem[], count || 0, query.dueOnOrBefore);
  }
  const sourceId = String(sourceResult.data.id);
  const delivery = await sendSlackIntakePrompt({ sourceId, channelId: input.channelId, externalId: input.externalId, threadTs: input.threadTs, text: reply });
  return { ...delivery, sourceId, needsInfo: query.invalidDate || matches.length !== 1 };
}
