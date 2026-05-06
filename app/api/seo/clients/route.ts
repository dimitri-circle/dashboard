import { NextResponse } from "next/server";
import { createClient, listClients } from "@/lib/seo/service";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";

export async function GET() {
  try {
    return NextResponse.json({ clients: await listClients() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load clients." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "client.create", 10, 60_000);
    return NextResponse.json({ client: await createClient(await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create client." },
      { status: 400 }
    );
  }
}
