import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/seo/db";

export async function sendSlackIntakePrompt(input: {
  sourceId: string;
  channelId: string;
  externalId: string;
  threadTs?: string;
  text: string;
}) {
  const supabase = getSupabaseAdminClient();
  const { data: inserted, error: insertError } = await supabase
    .from("work_slack_intake_prompts")
    .insert({
      id: randomUUID(),
      source_id: input.sourceId,
      external_id: input.externalId,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (insertError && insertError.code !== "23505") throw insertError;
  let delivery = inserted;
  if (insertError?.code === "23505") {
    const { data: retried, error: retryError } = await supabase.from("work_slack_intake_prompts")
      .update({ status: "pending", error_text: null, updated_at: new Date().toISOString() })
      .eq("source_id", input.sourceId).eq("external_id", input.externalId).eq("status", "failed")
      .select("id").maybeSingle();
    if (retryError) throw retryError;
    if (retried) delivery = retried;
    else {
      const { data: prior, error: priorError } = await supabase.from("work_slack_intake_prompts")
        .select("status").eq("source_id", input.sourceId).eq("external_id", input.externalId).maybeSingle();
      if (priorError) throw priorError;
      return { outcome: prior?.status === "uncertain" ? "uncertain" as const : "duplicate" as const };
    }
  }
  if (!delivery) return { outcome: "duplicate" as const };

  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    await supabase.from("work_slack_intake_prompts").update({ status: "failed", error_text: "SLACK_BOT_TOKEN is not configured.", updated_at: new Date().toISOString() }).eq("id", delivery.id);
    return { outcome: "failed" as const };
  }

  try {
    const digest = createHash("sha256").update(`${input.sourceId}:${input.externalId}`).digest("hex");
    const clientMsgId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: input.channelId, text: input.text, ...(input.threadTs ? { thread_ts: input.threadTs, reply_broadcast: false } : {}), client_msg_id: clientMsgId, unfurl_links: false }),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json() as { ok?: boolean; ts?: string; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error || `Slack returned ${response.status}`);
    await supabase.from("work_slack_intake_prompts").update({ status: "sent", slack_ts: payload.ts || null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_text: null }).eq("id", delivery.id);
    return { outcome: "sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof TypeError || (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) ? "uncertain" : "failed";
    await supabase.from("work_slack_intake_prompts").update({ status, error_text: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", delivery.id);
    console.error("Slack command reply failed", message);
    return { outcome: status as "failed" | "uncertain" };
  }
}
