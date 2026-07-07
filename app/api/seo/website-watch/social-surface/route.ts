import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { normalizeSocialSurfaceInput, runSocialSurfaceScan } from "@/lib/seo/social-surface";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "website-watch.social-surface", 4, 60_000);
    const input = normalizeSocialSurfaceInput(await request.json());
    const result = await runSocialSurfaceScan(input);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run social surface scan." },
      { status: 400 }
    );
  }
}
