import { NextResponse } from "next/server";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { getWorkNotificationPreferences, saveWorkNotificationPreferences } from "@/lib/work-manager/notifications";

export async function GET(request: Request) {
  try {
    const session = await requireWorkSession(request);
    return NextResponse.json({ preferences: await getWorkNotificationPreferences(session.userId) });
  } catch (error) {
    return workErrorResponse(error, "Unable to load notification preferences.");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireWorkSession(request);
    return NextResponse.json({ preferences: await saveWorkNotificationPreferences(session.userId, await request.json()) });
  } catch (error) {
    return workErrorResponse(error, "Unable to save notification preferences.");
  }
}
