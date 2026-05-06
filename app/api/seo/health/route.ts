import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    checks: {
      mongodb_uri: Boolean(process.env.MONGODB_URI),
      mongodb_db: Boolean(process.env.MONGODB_DB),
      encryption_key: Boolean(process.env.SEO_SECRET_ENCRYPTION_KEY),
      cron_secret: Boolean(process.env.CRON_SECRET),
      openai_model: process.env.OPENAI_SEO_MODEL || "gpt-4o-mini",
      client_allow_list_enabled: Boolean(process.env.SEO_ALLOWED_CLIENT_IDS),
    },
  });
}
