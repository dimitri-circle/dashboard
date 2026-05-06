import { NextResponse } from "next/server";
import { testIntegration } from "@/lib/seo/service";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    rateLimitFromRequest(request, "integration.test", 20, 60_000);
    const { id } = await context.params;
    return NextResponse.json(await testIntegration(getTenantScopeFromRequest(request), id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connection test failed." },
      { status: 400 }
    );
  }
}
