import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { workErrorResponse } from "@/lib/work-manager/http";
import { isValidMeetingDocExportRequest, meetingDocPayloadByClientKey } from "@/lib/work-manager/meeting-docs";

export async function GET(request: Request) {
  if (!isValidMeetingDocExportRequest(request)) {
    return NextResponse.json({ error: "Meeting document export authorization failed." }, { status: 401 });
  }
  try {
    rateLimitFromRequest(request, "work-manager.meeting-document.export", 40, 60_000);
    const clientKey = new URL(request.url).searchParams.get("client") || "";
    return NextResponse.json(await meetingDocPayloadByClientKey(clientKey));
  } catch (error) {
    return workErrorResponse(error, "Unable to export meeting document work.");
  }
}
