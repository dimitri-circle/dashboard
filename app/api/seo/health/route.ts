import { NextResponse } from "next/server";
import { pingSeoDb } from "@/lib/seo/db";

export async function GET() {
  const hasMongoEnv = Boolean(process.env.MONGODB_URI && process.env.MONGODB_DB);
  let mongodbReachable = false;
  let mongodbStatus = hasMongoEnv ? "not_checked" : "missing_env";

  if (hasMongoEnv) {
    try {
      mongodbReachable = await pingSeoDb();
      mongodbStatus = "reachable";
    } catch {
      mongodbStatus = "unreachable";
    }
  }

  return NextResponse.json({
    ok: true,
    checks: {
      mongodb_uri: Boolean(process.env.MONGODB_URI),
      mongodb_db: Boolean(process.env.MONGODB_DB),
      mongodb_reachable: mongodbReachable,
      mongodb_status: mongodbStatus,
      encryption_key: Boolean(process.env.SEO_SECRET_ENCRYPTION_KEY),
      cron_secret: Boolean(process.env.CRON_SECRET),
      openai_model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini",
      client_allow_list_enabled: Boolean(process.env.SEO_ALLOWED_CLIENT_IDS),
    },
  });
}
