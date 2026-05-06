import { NextResponse } from "next/server";
import { listIntegrations, upsertIntegration } from "@/lib/seo/service";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ integrations: await listIntegrations(getTenantScopeFromRequest(request)) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load integrations." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "integration.upsert", 30, 60_000);
    const body = await request.json();
    return NextResponse.json(
      { integration: await upsertIntegration(getTenantScopeFromRequest(request), body) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save integration." },
      { status: 400 }
    );
  }
}
