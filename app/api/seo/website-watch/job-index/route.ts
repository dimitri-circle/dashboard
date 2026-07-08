import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getVastJobIndexState, runPersistedVastJobIndex } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    rateLimitFromRequest(request, "website-watch.job-index.list", 30, 60_000);
    const url = new URL(request.url);
    const state = await getVastJobIndexState(getTenantScopeFromRequest(request), url.searchParams.get("sourceUrl"));
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Vast Job Index state." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "website-watch.job-index", 4, 60_000);
    const output = await runPersistedVastJobIndex(getTenantScopeFromRequest(request), await request.json());
    return NextResponse.json(output, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run Vast Job Index scan." },
      { status: 400 }
    );
  }
}
