import { NextResponse } from "next/server";
import { getWorkItemLocation } from "@/lib/work-manager/service";
import { requireWorkSession } from "@/lib/work-manager/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireWorkSession(request);
  const { id } = await params;
  const item = await getWorkItemLocation(id);
  const destination = new URL("/", request.url);
  destination.searchParams.set("view", "work");
  destination.searchParams.set("client", item.client_id);
  destination.searchParams.set("item", item.id);
  return NextResponse.redirect(destination, 307);
}
