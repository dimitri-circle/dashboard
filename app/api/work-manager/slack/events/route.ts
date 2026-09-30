import { after, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/seo/db";
import { intakeSlackCandidates } from "@/lib/work-manager/intake";
import { rememberMissingSlackStatus, rememberMissingSlackTask, tryCompleteSlackTaskThread } from "@/lib/work-manager/slack-command-drafts";
import { sendSlackIntakePrompt } from "@/lib/work-manager/slack-intake-prompts";
import { replyWithSlackClientStatus, replyWithSlackTaskHelp } from "@/lib/work-manager/slack-status";
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
      const threadMessage = {
        workspaceRef: normalized.workspaceRef,
        channelId: normalized.sourceRef,
        externalId: normalized.message.externalId,
        threadTs: normalized.message.threadTs,
        userRef: normalized.message.userRef,
        text: normalized.message.text,
        sourceUrl: normalized.message.sourceUrl,
      };
      if (normalized.message.threadContext && ["add", "status", "followup"].includes(normalized.command.kind)
        && await tryCompleteSlackTaskThread(threadMessage)) return;
      if (normalized.command.kind === "followup") return;
      if (normalized.command.kind === "help") {
        const delivery = await replyWithSlackTaskHelp({ workspaceRef: normalized.workspaceRef, channelId: normalized.sourceRef,
          externalId: normalized.message.externalId, threadTs: normalized.message.threadTs });
        if (delivery.outcome === "failed" || delivery.outcome === "uncertain") throw new Error(`Slack help reply delivery ${delivery.outcome}.`);
        return;
      }
      if (normalized.command.kind === "status") {
        const delivery = await replyWithSlackClientStatus({ workspaceRef: normalized.workspaceRef, channelId: normalized.sourceRef,
          externalId: normalized.message.externalId, threadTs: normalized.message.threadTs, clientName: normalized.command.argument });
        if (delivery.needsInfo) await rememberMissingSlackStatus({ ...threadMessage, sourceId: delivery.sourceId });
        if (delivery.outcome === "failed" || delivery.outcome === "uncertain") throw new Error(`Slack status reply delivery ${delivery.outcome}.`);
        return;
      }
      const result = await intakeSlackCandidates({
        sourceRef: normalized.sourceRef,
        workspaceRef: normalized.workspaceRef,
        messages: [normalized.message],
      });
      for (const prompt of result.needsInfo) {
        await rememberMissingSlackTask({
          ...threadMessage,
          sourceId: prompt.sourceId,
          promptText: prompt.promptText,
        });
      }
      if (!result.result?.items.length && !result.needsInfo.length) throw new Error("Slack task command produced no task.");
    } catch (error) {
      console.error("Work Manager Slack event intake failed", error);
      try {
        const { data: source } = await getSupabaseAdminClient().from("work_sources").select("id")
          .eq("source_kind", "slack").eq("workspace_ref", normalized.workspaceRef)
          .eq("source_ref", normalized.sourceRef).eq("active", true).maybeSingle();
        if (source) await sendSlackIntakePrompt({ sourceId: String(source.id), channelId: normalized.sourceRef,
          externalId: normalized.message.externalId, threadTs: normalized.message.threadTs,
          text: "I could not finish that command. Please retry in this thread; if it still fails, use Work Manager or ask an admin." });
      } catch (replyError) {
        console.error("Work Manager Slack command error reply failed", replyError);
      }
    }
  });
  return NextResponse.json({ ok: true, accepted: true });
}
