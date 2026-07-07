import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { saveBrainContext } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "blog-audit.context", 12, 60_000);
    const context = await saveBrainContext(getTenantScopeFromRequest(request), await request.json());
    return NextResponse.json({ context });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save Br(AI)N context." },
      { status: 400 }
    );
  }
}
