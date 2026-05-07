import { NextResponse } from "next/server";
import { syncGa4Metrics } from "@/lib/seo/service";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "sync.ga4", 10, 60_000);
    return NextResponse.json(
      { metricSnapshots: await syncGa4Metrics(getTenantScopeFromRequest(request)) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync GA4 metrics." },
      { status: 400 }
    );
  }
}
