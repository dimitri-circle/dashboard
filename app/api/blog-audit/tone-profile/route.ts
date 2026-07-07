import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { generateAndSaveBrainToneProfile } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "blog-audit.tone-profile", 8, 60_000);
    return NextResponse.json(
      await generateAndSaveBrainToneProfile(getTenantScopeFromRequest(request), await request.json())
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate tone profile." },
      { status: 400 }
    );
  }
}
