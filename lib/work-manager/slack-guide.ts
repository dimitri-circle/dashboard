import { getSupabaseAdminClient } from "@/lib/seo/db";
import { sendSlackIntakePrompt } from "./slack-intake-prompts";

const CENTRAL_TIME = "America/Chicago";
const GUIDE_KEY_PREFIX = "dashboard-guide:";

export function slackGuideEnabled(value: string | undefined) {
  return value === "true";
}

function centralParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value || "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, weekday: part("weekday"), hour: Number(part("hour")) };
}

function businessDaysAfter(previous: string, current: string) {
  let cursor = Date.parse(`${previous}T00:00:00Z`);
  const end = Date.parse(`${current}T00:00:00Z`);
  if (!Number.isFinite(cursor) || !Number.isFinite(end) || cursor >= end) return 0;
  if (end - cursor >= 14 * 86_400_000) return 2;
  let days = 0;
  while (cursor < end) {
    cursor += 86_400_000;
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

export function guideReminderDate(now: Date, lastAttemptAt?: string | null) {
  if (Number.isNaN(now.getTime())) return null;
  const current = centralParts(now);
  if (current.hour !== 9 || ["Sat", "Sun"].includes(current.weekday)) return null;
  if (!lastAttemptAt) return current.date;
  const previous = new Date(lastAttemptAt);
  if (Number.isNaN(previous.getTime())) return null;
  return businessDaysAfter(centralParts(previous).date, current.date) >= 2 ? current.date : null;
}

export function buildSlackDashboardGuide(baseUrl: string) {
  return [
    "*CircleClick Work Manager quick guide*",
    "• Add work: `@task-add Publish the approved video by Friday ABK Labs Video Queue` (include a due date and client; add the workstream if your client has more than one).",
    "• Check shared work: `@task-status ABK Labs` or `@task-status ABK Labs by Friday` (due on or before; internal-only tasks stay private).",
    "• Need a reminder? `@task-help`. If the bot asks for a missing detail, reply in its thread with just that detail.",
    "The bot replies in your command thread with task links. Open one to move work, assign an owner, and add comments; the channel stays quiet.",
    `<${baseUrl.replace(/\/$/, "")}/|Open the dashboard>`,
  ].join("\n");
}

export async function runSlackDashboardGuide(now = new Date()) {
  if (!slackGuideEnabled(process.env.WORK_MANAGER_SLACK_GUIDE_ENABLED)) return { outcome: "disabled" as const };
  const today = guideReminderDate(now);
  if (!today) return { outcome: "not-scheduled" as const };

  const workspaceId = process.env.WORK_MANAGER_SLACK_WORKSPACE_ID?.trim();
  const developerChannelId = process.env.WORK_MANAGER_SLACK_CHANNEL_ID?.trim();
  const designChannelId = process.env.WORK_MANAGER_SLACK_DESIGN_CHANNEL_ID?.trim();
  if (!workspaceId || !developerChannelId || !designChannelId || developerChannelId === designChannelId || !process.env.SLACK_BOT_TOKEN?.trim()) {
    throw new Error("CircleClick Slack guide is not configured for both channels.");
  }

  const db = getSupabaseAdminClient();
  const channelIds = [designChannelId, developerChannelId];
  const { data: sources, error: sourceError } = await db.from("work_sources")
    .select("id,source_ref")
    .eq("source_kind", "slack")
    .eq("workspace_ref", workspaceId)
    .eq("active", true)
    .in("source_ref", channelIds);
  if (sourceError) throw sourceError;
  if (!sources || sources.length !== 2 || channelIds.some((channelId) => !sources.some((source) => source.source_ref === channelId))) {
    throw new Error("Both CircleClick Slack channels need active Work Manager source mappings before reminders can post.");
  }

  const attempts = await Promise.all(channelIds.map(async (channelId) => {
    const source = sources.find((entry) => entry.source_ref === channelId)!;
    const { data, error } = await db.from("work_slack_intake_prompts")
      .select("created_at")
      .eq("source_id", source.id)
      .like("external_id", `${GUIDE_KEY_PREFIX}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { channelId, sourceId: String(source.id), due: guideReminderDate(now, data?.created_at) === today };
  }));

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.WORK_MANAGER_PUBLIC_URL || "https://dashboard-circleclick.vercel.app";
  const text = buildSlackDashboardGuide(baseUrl);
  const results = [] as Array<{ channelId: string; outcome: "sent" | "duplicate" | "failed" | "uncertain" | "skipped" }>;
  for (const attempt of attempts) {
    if (!attempt.due) {
      results.push({ channelId: attempt.channelId, outcome: "skipped" });
      continue;
    }
    // The existing unique (source_id, external_id) ledger gives each channel
    // one at-most-once top-level post per Central Time business date.
    const result = await sendSlackIntakePrompt({
      sourceId: attempt.sourceId,
      channelId: attempt.channelId,
      externalId: `${GUIDE_KEY_PREFIX}${today}`,
      text,
    });
    results.push({ channelId: attempt.channelId, outcome: result.outcome });
  }
  return { outcome: "processed" as const, date: today, results };
}
