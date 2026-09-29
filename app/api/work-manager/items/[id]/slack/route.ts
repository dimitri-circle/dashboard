import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { retryWorkSlackDelivery } from "@/lib/work-manager/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    rateLimitFromRequest(request, "work-item.slack-retry", 10, 60_000);
    await requireWorkSession(request, true);
    const scope = getTenantScopeFromRequest(request);
    const { id } = await params;
    const payload = await request.json() as { deliveryId?: unknown };
    if (typeof payload.deliveryId !== "string" || !payload.deliveryId.trim()) throw new Error("Slack delivery id is required.");
    await retryWorkSlackDelivery(scope.userId, id, payload.deliveryId.trim());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workErrorResponse(error, "Unable to retry the Slack update.");
  }
}
