import { NextResponse } from "next/server";
import { bootstrapSeoStorage } from "@/lib/seo/service";

export async function POST(request: Request) {
  try {
    const adminSecret = process.env.SEO_ADMIN_SECRET;
    if (adminSecret && request.headers.get("authorization") !== `Bearer ${adminSecret}`) {
      return NextResponse.json({ error: "Unauthorized bootstrap request." }, { status: 401 });
    }

    return NextResponse.json(await bootstrapSeoStorage());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to bootstrap SEO storage." },
      { status: 500 }
    );
  }
}
