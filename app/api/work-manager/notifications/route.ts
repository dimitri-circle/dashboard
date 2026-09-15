import { NextResponse } from "next/server";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { listWorkNotifications, markWorkNotificationsRead } from "@/lib/work-manager/notifications";

export async function GET(request: Request) {
  try {
    const session = await requireWorkSession(request);
    return NextResponse.json({ notifications: await listWorkNotifications(session.userId) });
  } catch (error) {
    return workErrorResponse(error, "Unable to load work notifications.");
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireWorkSession(request);
    const payload = await request.json() as { ids?: unknown };
    const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === "string") : undefined;
    await markWorkNotificationsRead(session.userId, ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workErrorResponse(error, "Unable to update work notifications.");
  }
}
