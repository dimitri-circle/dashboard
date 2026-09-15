import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { createWorkChannel, listWorkChannels } from "@/lib/work-manager/service";

export async function GET(request: Request) {
  try {
    await requireWorkSession(request);
    const scope = getTenantScopeFromRequest(request);
    return NextResponse.json({ channels: await listWorkChannels(scope.userId) });
  } catch (error) {
    return workErrorResponse(error, "Unable to load work channels.");
  }
}

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "work-channel.create", 20, 60_000);
    const session = await requireWorkSession(request, true);
    const scope = getTenantScopeFromRequest(request);
    return NextResponse.json(
      { channel: await createWorkChannel(scope.userId, session.userId, await request.json()) },
      { status: 201 }
    );
  } catch (error) {
    return workErrorResponse(error, "Unable to create work channel.");
  }
}
