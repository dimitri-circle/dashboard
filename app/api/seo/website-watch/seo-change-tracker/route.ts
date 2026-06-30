import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { normalizeSeoChangeTrackerInput, runSeoChangeTracker } from "@/lib/seo/seo-change-tracker";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "website-watch.seo-change-tracker", 4, 60_000);
    const input = normalizeSeoChangeTrackerInput(await request.json());
    const result = await runSeoChangeTracker(input);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run SEO change tracker." },
      { status: 400 }
    );
  }
}
