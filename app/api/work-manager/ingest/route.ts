import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { ingestWorkBatch, isValidWorkIngestRequest } from "@/lib/work-manager/ingest";
import { workErrorResponse } from "@/lib/work-manager/http";

export async function POST(request: Request) {
  if (!isValidWorkIngestRequest(request, process.env.WORK_MANAGER_INGEST_SECRET)) {
    return NextResponse.json({ error: "Automation ingest authorization failed." }, { status: 401 });
  }

  try {
    rateLimitFromRequest(request, "work-manager.ingest", 30, 60_000);
    return NextResponse.json({ result: await ingestWorkBatch(await request.json()) });
  } catch (error) {
    return workErrorResponse(error, "Unable to ingest work updates.");
  }
}
