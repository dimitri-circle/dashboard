import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { updateWorkItem } from "@/lib/work-manager/service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    rateLimitFromRequest(request, "work-item.update", 80, 60_000);
    const session = await requireWorkSession(request, true);
    const scope = getTenantScopeFromRequest(request);
    const { id } = await context.params;
    return NextResponse.json({
      item: await updateWorkItem(scope.userId, id, session.userId, await request.json()),
    });
  } catch (error) {
    return workErrorResponse(error, "Unable to update work item.");
  }
}
