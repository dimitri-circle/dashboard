import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { createWorkItem, listWorkItems } from "@/lib/work-manager/service";

export async function GET(request: Request) {
  try {
    await requireWorkSession(request);
    const scope = getTenantScopeFromRequest(request);
    const channelId = new URL(request.url).searchParams.get("channelId");
    return NextResponse.json({ items: await listWorkItems(scope.userId, channelId) });
  } catch (error) {
    return workErrorResponse(error, "Unable to load work items.");
  }
}

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "work-item.create", 40, 60_000);
    const session = await requireWorkSession(request, true);
    const scope = getTenantScopeFromRequest(request);
    return NextResponse.json(
      { item: await createWorkItem(scope.userId, session.userId, await request.json()) },
      { status: 201 }
    );
  } catch (error) {
    return workErrorResponse(error, "Unable to create work item.");
  }
}
