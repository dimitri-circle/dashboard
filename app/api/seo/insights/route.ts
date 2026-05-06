import { NextResponse } from "next/server";
import { listInsights } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ insights: await listInsights(getTenantScopeFromRequest(request)) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load insights." },
      { status: 500 }
    );
  }
}
