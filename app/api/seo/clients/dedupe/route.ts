import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { dedupeClients } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "client.dedupe", 5, 60_000);
    return NextResponse.json({ result: await dedupeClients(getTenantScopeFromRequest(request)) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to deduplicate clients." },
      { status: 400 }
    );
  }
}
