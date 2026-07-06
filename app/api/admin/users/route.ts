import { NextResponse } from "next/server";
import { listAppUsers, normalizeAppRole, requireAdminAppSession, saveAppUser } from "@/lib/seo/auth";
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

export async function GET(request: Request) {
  try {
    await requireAdminAppSession(request);
    return NextResponse.json({ users: await listAppUsers() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load login users." },
      { status: adminErrorStatus(error, 500) }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminAppSession(request);
    rateLimitFromRequest(request, "admin.users.create", 10, 60_000);
    const body = await request.json();
    const user = await saveAppUser({
      email: String(body.email || ""),
      password: String(body.password || ""),
      role: normalizeAppRole(body.role),
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save login user." },
      { status: adminErrorStatus(error, 400) }
    );
  }
}
