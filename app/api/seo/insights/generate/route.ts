import { NextResponse } from "next/server";
import { generateInsights } from "@/lib/seo/service";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "insights.generate", 5, 60_000);
    return NextResponse.json(
      { insights: await generateInsights(getTenantScopeFromRequest(request)) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate insights." },
      { status: 400 }
    );
  }
}
