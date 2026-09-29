import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import { addWorkItemComment, getWorkItemActivity } from "@/lib/work-manager/service";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWorkSession(request);
    const scope = getTenantScopeFromRequest(request);
    const { id } = await params;
    return NextResponse.json(await getWorkItemActivity(scope.userId, id));
  } catch (error) {
    return workErrorResponse(error, "Unable to load work activity.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    rateLimitFromRequest(request, "work-item.comment", 40, 60_000);
    const session = await requireWorkSession(request, true);
    const scope = getTenantScopeFromRequest(request);
    const { id } = await params;
    const payload = await request.json() as { body?: unknown; clientVisible?: unknown };
    const comment = await addWorkItemComment(scope.userId, id, { id: session.userId, name: session.email }, payload.body, payload.clientVisible);
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return workErrorResponse(error, "Unable to add work comment.");
  }
}
