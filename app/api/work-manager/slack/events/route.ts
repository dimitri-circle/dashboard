import { after, NextResponse } from "next/server";
import { intakeSlackCandidates } from "@/lib/work-manager/intake";
import { sendSlackIntakePrompt } from "@/lib/work-manager/slack-intake-prompts";
import { replyWithSlackClientStatus } from "@/lib/work-manager/slack-status";
import { isValidSlackSignature, normalizeSlackTaskEvent, type SlackEventEnvelope } from "@/lib/work-manager/slack-events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!isValidSlackSignature(
    rawBody,
    request.headers.get("x-slack-request-timestamp"),
    request.headers.get("x-slack-signature"),
    process.env.SLACK_SIGNING_SECRET,
  )) {
    return NextResponse.json({ error: "Slack request verification failed." }, { status: 401 });
  }

  let payload: SlackEventEnvelope;
  try {
    payload = JSON.parse(rawBody) as SlackEventEnvelope;
  } catch {
    return NextResponse.json({ error: "Slack request body is not valid JSON." }, { status: 400 });
  }

  if (payload.type === "url_verification" && typeof (payload as { challenge?: unknown }).challenge === "string") {
    return new Response((payload as { challenge: string }).challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  const normalized = normalizeSlackTaskEvent(payload, {
    workspaceId: process.env.WORK_MANAGER_SLACK_WORKSPACE_ID || "",
    channelIds: [process.env.WORK_MANAGER_SLACK_CHANNEL_ID, process.env.WORK_MANAGER_SLACK_DESIGN_CHANNEL_ID].filter((id): id is string => Boolean(id)),
    workspaceDomain: process.env.WORK_MANAGER_SLACK_WORKSPACE_DOMAIN,
  });
  if (!normalized) return NextResponse.json({ ok: true, ignored: true });

  after(async () => {
    try {
      if (normalized.command.kind === "status") {
        await replyWithSlackClientStatus({ workspaceRef: normalized.workspaceRef, channelId: normalized.sourceRef,
          externalId: normalized.message.externalId, threadTs: normalized.message.threadTs, clientName: normalized.command.argument });
        return;
      }
      const result = await intakeSlackCandidates({
        sourceRef: normalized.sourceRef,
        workspaceRef: normalized.workspaceRef,
        messages: [normalized.message],
      });
      for (const prompt of result.needsInfo) await sendSlackIntakePrompt({ ...prompt, text: prompt.promptText });
    } catch (error) {
      console.error("Work Manager Slack event intake failed", error);
    }
  });
  return NextResponse.json({ ok: true, accepted: true });
}
