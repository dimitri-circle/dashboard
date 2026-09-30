import { NextResponse } from "next/server";
import { assertCronRequest } from "@/lib/seo/cron";
import { runSlackDashboardGuide } from "@/lib/work-manager/slack-guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertCronRequest(request);
    const result = await runSlackDashboardGuide();
    if (result.outcome === "processed" && result.results.some((entry) => entry.outcome === "failed" || entry.outcome === "uncertain")) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Work Manager guide failed.";
    return NextResponse.json({ error: message }, { status: /Unauthorized/.test(message) ? 401 : 500 });
  }
}
