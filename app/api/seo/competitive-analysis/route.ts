import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { generateCompetitiveAnalysis, listCompetitiveAnalyses } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export async function GET(request: Request) {
  try {
    rateLimitFromRequest(request, "competitive.list", 60, 60_000);
    return NextResponse.json({ analyses: await listCompetitiveAnalyses(getTenantScopeFromRequest(request)) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load competitive analyses." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "competitive.generate", 4, 60_000);
    const body = await request.json();
    const analysis = await generateCompetitiveAnalysis(getTenantScopeFromRequest(request), body);
    return NextResponse.json({ analysis }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate competitive analysis." },
      { status: 400 }
    );
  }
}
