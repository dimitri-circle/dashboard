import { NextResponse } from "next/server";
import { pingSeoDb } from "@/lib/seo/db";

export async function GET() {
  const hasSupabaseEnv = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
  let supabaseReachable = false;
  let supabaseStatus = hasSupabaseEnv ? "not_checked" : "missing_env";

  if (hasSupabaseEnv) {
    try {
      supabaseReachable = await pingSeoDb();
      supabaseStatus = "reachable";
    } catch {
      supabaseStatus = "unreachable";
    }
  }

  return NextResponse.json({
    ok: true,
    checks: {
      supabase_url: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabase_secret_key: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
      supabase_reachable: supabaseReachable,
      supabase_status: supabaseStatus,
      encryption_key: Boolean(process.env.SEO_SECRET_ENCRYPTION_KEY),
      cron_secret: Boolean(process.env.CRON_SECRET),
      openai_api_key: Boolean(process.env.OPENAI_API_KEY),
      slack_webhook: Boolean(process.env.SEO_WATCH_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL),
      openai_model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini",
      client_allow_list_enabled: Boolean(process.env.SEO_ALLOWED_CLIENT_IDS),
    },
  });
}
