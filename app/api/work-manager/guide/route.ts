import { NextResponse } from "next/server";
import { getWorkGuideProgress, saveWorkGuideProgress, workManagerGuideEnabled } from "@/lib/work-manager/guide";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";

export async function GET(request: Request) {
  try {
    const session = await requireWorkSession(request);
    return NextResponse.json({ enabled: workManagerGuideEnabled(), progress: await getWorkGuideProgress(session.userId) });
  } catch (error) {
    return workErrorResponse(error, "Unable to load walkthrough progress.");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireWorkSession(request);
    return NextResponse.json({ enabled: workManagerGuideEnabled(), progress: await saveWorkGuideProgress(session.userId, await request.json()) });
  } catch (error) {
    return workErrorResponse(error, "Unable to save walkthrough progress.");
  }
}
