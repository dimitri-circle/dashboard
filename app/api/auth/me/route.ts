import { NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/seo/auth";

export async function GET(request: Request) {
  try {
    const session = await getCurrentAppSession(request);

    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: session.userId,
        email: session.email,
        role: session.role,
        legacy: Boolean(session.legacy),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read login session." },
      { status: 500 }
    );
  }
}
