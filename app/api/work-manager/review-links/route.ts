import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { createWorkReviewLink, revokeWorkReviewLink } from "@/lib/work-manager/service";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "work-review-link.create", 20, 60_000);
    const session = await requireWorkSession(request, true);
    const scope = getTenantScopeFromRequest(request);
    return NextResponse.json(
      await createWorkReviewLink(scope.userId, session.userId, await request.json()),
      { status: 201 }
    );
  } catch (error) {
    return workErrorResponse(error, "Unable to create client review link.");
  }
}

export async function PATCH(request: Request) {
  try {
    rateLimitFromRequest(request, "work-review-link.revoke", 20, 60_000);
    await requireWorkSession(request, true);
    const scope = getTenantScopeFromRequest(request);
    const payload = (await request.json()) as { linkId?: unknown };
    const linkId = typeof payload.linkId === "string" ? payload.linkId.trim() : "";
    if (!linkId) throw new Error("Review link id is required.");
    return NextResponse.json({ link: await revokeWorkReviewLink(scope.userId, linkId) });
  } catch (error) {
    return workErrorResponse(error, "Unable to revoke client review link.");
  }
}
