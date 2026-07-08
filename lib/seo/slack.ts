import type { SeoChangeRecord, SeoChangeTrackerResult } from "./seo-change-tracker";
import type { SeoTenantScope } from "./tenant";
import type { VastJobIndexChange, VastJobIndexResult } from "./job-index";

type SlackTextBlock = {
  type: "section";
  text: {
    type: "mrkdwn";
    text: string;
  };
};

type SlackDividerBlock = {
  type: "divider";
};

type SlackPayload = {
  text: string;
  blocks: Array<SlackTextBlock | SlackDividerBlock>;
};

type SlackNotifyResult =
  | { status: "skipped"; reason: string }
  | { status: "sent" }
  | { status: "failed"; error: string };

const SLACK_WEBHOOK_TIMEOUT_MS = 5000;

function slackText(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slackLink(url: string, label: string) {
  return `<${url.replace(/>/g, "%3E")}|${slackText(label)}>`;
}

function formatCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
}

function formatChange(change: SeoChangeRecord) {
  return `- *${slackText(change.label)}* (${slackText(change.severity)}): ${slackText(change.url)}`;
}

function formatJobIndexChange(change: VastJobIndexChange) {
  const value = change.after || change.before || change.detail;
  return `- *${slackText(change.label)}* (${slackText(change.severity)}): ${slackText(change.title)}${value ? ` - ${slackText(value)}` : ""}`;
}

function dashboardLink(dashboardUrl: string | null | undefined) {
  if (!dashboardUrl) return null;
  try {
    const url = new URL(dashboardUrl);
    return slackLink(url.toString(), "Open dashboard");
  } catch {
    return null;
  }
}

export function shouldSendSeoWatchSlackAlert(result: SeoChangeTrackerResult) {
  return result.status === "baseline" || result.status === "changed";
}

export function shouldSendVastJobIndexSlackAlert(result: VastJobIndexResult) {
  return result.status === "baseline" || result.status === "changed" || result.status === "failed";
}

export function buildSeoWatchSlackPayload({
  dashboardUrl,
  result,
  scope,
}: {
  dashboardUrl?: string | null;
  result: SeoChangeTrackerResult;
  scope: SeoTenantScope;
}): SlackPayload {
  const baseline = result.status === "baseline";
  const title = baseline ? "SEO baseline captured" : "SEO changes detected";
  const site = slackLink(result.siteUrl, result.siteUrl);
  const link = dashboardLink(dashboardUrl);
  const topChanges = result.changes.slice(0, 5);
  const summaryLines = [
    `*Client:* ${slackText(scope.userId)}`,
    `*Site:* ${site}`,
    `*Checked:* ${slackText(new Date(result.checkedAt).toLocaleString("en-US", { timeZone: "America/Chicago" }))}`,
    `*Pages:* ${formatCount(result.summary.pagesChecked)}`,
    `*Changed pages:* ${formatCount(result.summary.changedPages)}`,
    `*Metadata:* ${formatCount(result.summary.metadataChanges)}`,
    `*Copy:* ${formatCount(result.summary.copyChanges)}`,
    `*Technical:* ${formatCount(result.summary.technicalChanges)}`,
  ];

  if (link) {
    summaryLines.push(`*Review:* ${link}`);
  }

  const blocks: SlackPayload["blocks"] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${title}*\n${baseline ? "A new comparison point is now saved." : "Review the changed public SEO fields before the next publish."}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: summaryLines.join("\n"),
      },
    },
  ];

  if (topChanges.length) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Top changes*\n${topChanges.map(formatChange).join("\n")}`,
        },
      }
    );
  }

  return {
    text: `${title}: ${result.siteUrl}`,
    blocks,
  };
}

export function buildVastJobIndexSlackPayload({
  dashboardUrl,
  result,
  scope,
}: {
  dashboardUrl?: string | null;
  result: VastJobIndexResult;
  scope: SeoTenantScope;
}): SlackPayload {
  const title =
    result.status === "baseline"
      ? "Vast Job Index baseline captured"
      : result.status === "failed"
        ? "Vast Job Index scan failed"
        : "Vast Job Index changes detected";
  const source = slackLink(result.sourceUrl, result.sourceUrl);
  const link = dashboardLink(dashboardUrl);
  const topChanges = result.changes.slice(0, 5);
  const summaryLines = [
    `*Client:* ${slackText(scope.userId)}`,
    `*Source:* ${source}`,
    `*Checked:* ${slackText(new Date(result.checkedAt).toLocaleString("en-US", { timeZone: "America/Chicago" }))}`,
    `*Open roles:* ${formatCount(result.summary.openRoles)}`,
    `*Added:* ${formatCount(result.summary.addedRoles)}`,
    `*Removed:* ${formatCount(result.summary.removedRoles)}`,
    `*Changed roles:* ${formatCount(result.summary.changedRoles)}`,
    `*Comp changes:* ${formatCount(result.summary.compensationChanges)}`,
    `*Apply URL changes:* ${formatCount(result.summary.applyUrlChanges)}`,
    `*Google index:* ${result.summary.googleIndexKnown ? "Known" : "Unknown"}`,
    `*Indexability:* ${result.summary.noindex ? "Noindex present" : "No noindex metadata found"}`,
  ];

  if (link) {
    summaryLines.push(`*Review:* ${link}`);
  }

  const blocks: SlackPayload["blocks"] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${title}*\n${
          result.status === "baseline"
            ? "A jobs-page comparison point is now saved."
            : result.status === "failed"
              ? "The jobs page could not be scanned cleanly. Review the dashboard before relying on the result."
              : "Review public role, compensation, location, or apply-link changes."
        }`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: summaryLines.join("\n"),
      },
    },
  ];

  if (topChanges.length) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Top job changes*\n${topChanges.map(formatJobIndexChange).join("\n")}`,
        },
      }
    );
  }

  return {
    text: `${title}: ${result.sourceUrl}`,
    blocks,
  };
}

export function getSeoWatchSlackWebhookUrl() {
  return (process.env.SEO_WATCH_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || "").trim();
}

function redactedError(error: unknown, secret: string) {
  const message = error instanceof Error ? error.message : "Unknown Slack webhook error.";
  return secret ? message.replace(secret, "[redacted]") : message;
}

async function postSlackPayload(webhookUrl: string, payload: SlackPayload): Promise<SlackNotifyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 160);
      return { status: "failed", error: `Slack webhook failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}` };
    }

    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: redactedError(error, webhookUrl) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifySeoWatchSlack({
  dashboardUrl = process.env.SEO_DASHBOARD_URL || "",
  result,
  scope,
  webhookUrl = getSeoWatchSlackWebhookUrl(),
}: {
  dashboardUrl?: string | null;
  result: SeoChangeTrackerResult;
  scope: SeoTenantScope;
  webhookUrl?: string;
}): Promise<SlackNotifyResult> {
  if (!shouldSendSeoWatchSlackAlert(result)) {
    return { status: "skipped", reason: "No Slack alert is needed for this SEO tracker status." };
  }

  if (!webhookUrl) {
    return { status: "skipped", reason: "Slack webhook is not configured." };
  }

  return postSlackPayload(webhookUrl, buildSeoWatchSlackPayload({ dashboardUrl, result, scope }));
}

export async function notifyVastJobIndexSlack({
  dashboardUrl = process.env.SEO_DASHBOARD_URL || "",
  result,
  scope,
  webhookUrl = getSeoWatchSlackWebhookUrl(),
}: {
  dashboardUrl?: string | null;
  result: VastJobIndexResult;
  scope: SeoTenantScope;
  webhookUrl?: string;
}): Promise<SlackNotifyResult> {
  if (!shouldSendVastJobIndexSlackAlert(result)) {
    return { status: "skipped", reason: "No Slack alert is needed for this Vast Job Index status." };
  }

  if (!webhookUrl) {
    return { status: "skipped", reason: "Slack webhook is not configured." };
  }

  return postSlackPayload(webhookUrl, buildVastJobIndexSlackPayload({ dashboardUrl, result, scope }));
}
