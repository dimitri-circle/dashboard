import { NextResponse } from "next/server";
import { assertCronRequest } from "@/lib/seo/cron";
import { runScheduledSeoSync } from "@/lib/seo/service";

export async function GET(request: Request) {
  try {
    assertCronRequest(request);
    return NextResponse.json(await runScheduledSeoSync());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled SEO job failed.";
    return NextResponse.json({ error: message }, { status: /Unauthorized/.test(message) ? 401 : 500 });
  }
}
