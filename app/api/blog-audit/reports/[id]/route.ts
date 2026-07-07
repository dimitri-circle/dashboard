import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { updateBrainReportStatus } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import type { SeoBrainReportStatus } from "@/lib/seo/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    rateLimitFromRequest(request, "blog-audit.report-status", 30, 60_000);
    const { id } = await context.params;
    const body = (await request.json()) as { status?: SeoBrainReportStatus };
    const report = await updateBrainReportStatus(getTenantScopeFromRequest(request), id, body.status || "needs_edits");
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update Br(AI)N report status." },
      { status: 400 }
    );
  }
}
