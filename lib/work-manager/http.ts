import { NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/seo/auth";

export async function requireWorkSession(request: Request, mutate = false) {
  const session = await getCurrentAppSession(request);
  if (!session) throw new Error("Login required.");
  if (mutate && session.role === "viewer") throw new Error("Viewer access is read-only.");
  return session;
}

export function workErrorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "Login required."
    ? 401
    : message === "Viewer access is read-only."
      ? 403
      : /storage is not installed/i.test(message)
        ? 503
        : /not found|does not belong/i.test(message)
          ? 404
          : 400;
  return NextResponse.json({ error: message }, { status });
}
