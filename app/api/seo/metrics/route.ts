import { NextResponse } from "next/server";
import { listMetricSnapshots } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ metricSnapshots: await listMetricSnapshots(getTenantScopeFromRequest(request)) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load metric snapshots." },
      { status: 500 }
    );
  }
}
