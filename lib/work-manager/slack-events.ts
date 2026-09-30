import crypto from "node:crypto";

const COMMAND_PATTERN = /^\s*(?:[•*-]\s*)?@(task-add|circleclick-task-add|task-status|task-help)\b:?\s*(.*)$/is;
const MAX_CLOCK_SKEW_SECONDS = 60 * 5;

export type SlackMessageEvent = {
  type?: unknown;
  subtype?: unknown;
  bot_id?: unknown;
  channel?: unknown;
  channel_type?: unknown;
  user?: unknown;
  text?: unknown;
  ts?: unknown;
  thread_ts?: unknown;
};

export type SlackEventEnvelope = {
  type?: unknown;
  team_id?: unknown;
  event_id?: unknown;
  event?: SlackMessageEvent;
};

export type SlackCommandKind = "add" | "status" | "help" | "followup";

export function parseSlackCommand(value: string) {
  const match = value.match(COMMAND_PATTERN);
  if (!match) return null;
  const name = match[1].toLowerCase();
  return { kind: name === "task-status" ? "status" as const : name === "task-help" ? "help" as const : "add" as const,
    argument: match[2].trim() };
}

function stringValue(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function isValidSlackSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  signingSecret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!signingSecret || !timestampHeader || !signatureHeader) return false;
  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) return false;
  const baseString = `v0:${timestampHeader}:${rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex")}`;
  const actual = Buffer.from(signatureHeader, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

export function normalizeSlackTaskEvent(
  envelope: SlackEventEnvelope,
  config: { workspaceId: string; channelId?: string; channelIds?: string[]; workspaceDomain?: string },
) {
  const workspaceId = stringValue(envelope.team_id, 40);
  const event = envelope.event || {};
  const channelId = stringValue(event.channel, 40);
  const text = stringValue(event.text, 3000);
  const externalId = stringValue(event.ts, 80);
  const allowedChannels = config.channelIds || (config.channelId ? [config.channelId] : []);
  if (envelope.type !== "event_callback" || workspaceId !== config.workspaceId || !allowedChannels.includes(channelId)) return null;
  const userRef = stringValue(event.user, 80);
  if (event.type !== "message" || (event.channel_type && event.channel_type !== "channel") || event.subtype || event.bot_id || !userRef || !externalId || !text) return null;
  const threadContext = stringValue(event.thread_ts, 80);
  const command = parseSlackCommand(text) || (threadContext ? { kind: "followup" as const, argument: text } : null);
  if (!command) return null;
  const domain = stringValue(config.workspaceDomain, 120) || "circleclick.slack.com";
  const permalinkTs = externalId.replace(/\D/g, "");
  return {
    workspaceRef: workspaceId,
    sourceRef: channelId,
    command,
    message: {
      externalId,
      userRef,
      text,
      threadContext,
      threadTs: threadContext || externalId,
      sourceUrl: `https://${domain}/archives/${channelId}/p${permalinkTs}`,
      tagged: true,
    },
  };
}
