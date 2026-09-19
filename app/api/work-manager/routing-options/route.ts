import { NextResponse } from "next/server";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { listWorkRoutingOptions } from "@/lib/work-manager/service";

export async function GET(request: Request) {
  try {
    await requireWorkSession(request);
    getTenantScopeFromRequest(request);
    return NextResponse.json({ clients: await listWorkRoutingOptions() });
  } catch (error) {
    return workErrorResponse(error, "Unable to load client routing options.");
  }
}
