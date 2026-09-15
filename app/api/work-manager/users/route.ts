import { NextResponse } from "next/server";
import { requireWorkSession, workErrorResponse } from "@/lib/work-manager/http";
import { listWorkAssignableUsers } from "@/lib/work-manager/service";

export async function GET(request: Request) {
  try {
    await requireWorkSession(request);
    return NextResponse.json({ users: await listWorkAssignableUsers() });
  } catch (error) {
    return workErrorResponse(error, "Unable to load task owners.");
  }
}
