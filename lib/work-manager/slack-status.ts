import { getSupabaseAdminClient } from "@/lib/seo/db";
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

export function formatSlackStatus(clientName: string, items: VisibleItem[], total: number) {
  if (!total) return `${clientName}: no client-visible work is currently shared. Internal tasks are not shown.`;
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
  return `${slackText(clientName)}: ${total} client-visible task${total === 1 ? "" : "s"}${total > items.length ? ` (latest ${items.length} shown)` : ""}.\n${lines.join("\n")}`;
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
  const matches = resolveStatusClient(input.clientName, clients);
  let reply: string;
  if (matches.length !== 1) {
    const choices = clients.map((client) => client.name).sort((a, b) => a.localeCompare(b)).slice(0, 12).join(", ") || "none configured";
    reply = `Please name one client after @task-status (choose: ${choices}). Example: @task-status VAST`;
  } else {
    const { data, count, error } = await db.from("work_items")
      .select("id,title,status,workflow_stage,due_date", { count: "exact" })
      .eq("client_id", matches[0].id)
      .eq("client_visible", true)
      .is("dismissed_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    reply = formatSlackStatus(matches[0].name, (data || []) as VisibleItem[], count || 0);
  }
  return sendSlackIntakePrompt({ sourceId: String(sourceResult.data.id), channelId: input.channelId, externalId: input.externalId, threadTs: input.threadTs, text: reply });
}
