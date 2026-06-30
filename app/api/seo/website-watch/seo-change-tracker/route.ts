import { NextResponse } from "next/server";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import {
  getSeoChangeTrackerState,
  resetSeoWatchBaseline,
  runPersistedSeoChangeTracker,
} from "@/lib/seo/service";
import { normalizeSeoChangeTrackerInput } from "@/lib/seo/seo-change-tracker";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    rateLimitFromRequest(request, "website-watch.seo-change-tracker.list", 30, 60_000);
    const url = new URL(request.url);
    const state = await getSeoChangeTrackerState(getTenantScopeFromRequest(request), url.searchParams.get("siteUrl"));
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load SEO change tracker state." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "website-watch.seo-change-tracker", 4, 60_000);
    const input = normalizeSeoChangeTrackerInput(await request.json());
    const output = await runPersistedSeoChangeTracker(getTenantScopeFromRequest(request), input);
    return NextResponse.json(output, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run SEO change tracker." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    rateLimitFromRequest(request, "website-watch.seo-change-tracker.reset", 6, 60_000);
    const url = new URL(request.url);
    const siteUrl = url.searchParams.get("siteUrl");
    if (!siteUrl) {
      throw new Error("Site URL is required to reset an SEO baseline.");
    }
    return NextResponse.json(await resetSeoWatchBaseline(getTenantScopeFromRequest(request), siteUrl));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reset SEO change baseline." },
      { status: 400 }
    );
  }
}
