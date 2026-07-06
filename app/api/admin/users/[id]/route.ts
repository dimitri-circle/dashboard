import { NextResponse } from "next/server";
import { requireAdminAppSession, updateAppUserAccess } from "@/lib/seo/auth";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";

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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAppSession(request);
    rateLimitFromRequest(request, "admin.users.update", 30, 60_000);
    const { id } = await context.params;
    return NextResponse.json({ user: await updateAppUserAccess(id, await request.json()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update login user." },
      { status: adminErrorStatus(error, 400) }
    );
  }
}
