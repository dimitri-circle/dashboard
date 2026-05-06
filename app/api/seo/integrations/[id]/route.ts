import { NextResponse } from "next/server";
import { deleteIntegration } from "@/lib/seo/service";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    rateLimitFromRequest(request, "integration.delete", 20, 60_000);
    const { id } = await context.params;
    return NextResponse.json(await deleteIntegration(getTenantScopeFromRequest(request), id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete integration." },
      { status: 400 }
    );
  }
}
