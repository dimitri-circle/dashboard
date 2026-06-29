import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { normalizeWebsiteSurfaceInput, runWebsiteSurfaceCheck } from "@/lib/seo/website-surface";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "website-watch.surface", 4, 60_000);
    const input = normalizeWebsiteSurfaceInput(await request.json());
    const result = await runWebsiteSurfaceCheck(input);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run website surface check." },
      { status: 400 }
    );
  }
}
