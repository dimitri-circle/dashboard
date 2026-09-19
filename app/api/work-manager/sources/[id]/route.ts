import { NextResponse } from "next/server";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import { updateWorkSource } from "@/lib/work-manager/service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireWorkSession(request, true);
    const scope = getTenantScopeFromRequest(request);
    const { id } = await params;
    return NextResponse.json({ source: await updateWorkSource(scope.userId, id, await request.json()) });
  } catch (error) {
    return workErrorResponse(error, "Unable to update automation source.");
  }
}
