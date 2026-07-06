import { NextResponse } from "next/server";
import { updateClientFeatureFlags } from "@/lib/seo/service";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    rateLimitFromRequest(request, "client.update", 30, 60_000);
    const { id } = await context.params;
    return NextResponse.json({ client: await updateClientFeatureFlags(id, await request.json()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update client." },
      { status: 400 }
    );
  }
}
