import { NextResponse } from "next/server";
import { requireAdminAppSession } from "@/lib/seo/auth";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { clearBrainReports } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export const runtime = "nodejs";

function adminErrorStatus(error: unknown, fallback: number) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (error.message === "Login required.") {
    return 401;
  }

  if (error.message === "Admin role required.") {
    return 403;
  }

  return fallback;
}

export async function DELETE(request: Request) {
  try {
    await requireAdminAppSession(request);
    rateLimitFromRequest(request, "blog-audit.reports.clear", 4, 60_000);
    const body = await request.json().catch(() => ({}));

    if (body.confirm !== "CLEAR") {
      throw new Error("Type CLEAR to confirm report history cleanup.");
    }

    const deletedCount = await clearBrainReports(getTenantScopeFromRequest(request));
    return NextResponse.json({ ok: true, deletedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to clear Br(AI)N reports." },
      { status: adminErrorStatus(error, 400) }
    );
  }
}
