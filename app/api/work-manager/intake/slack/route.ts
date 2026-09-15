import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { isValidWorkIngestRequest } from "@/lib/work-manager/ingest";
import { intakeSlackCandidates } from "@/lib/work-manager/intake";
import { workErrorResponse } from "@/lib/work-manager/http";

export async function POST(request: Request) {
  if (!isValidWorkIngestRequest(request, process.env.WORK_MANAGER_INGEST_SECRET)) return NextResponse.json({ error: "Automation intake authorization failed." }, { status: 401 });
  try {
    rateLimitFromRequest(request, "work-manager.intake.slack", 30, 60_000);
    return NextResponse.json(await intakeSlackCandidates(await request.json()));
  } catch (error) { return workErrorResponse(error, "Unable to classify Slack work."); }
}
