import { NextResponse } from "next/server";
import { APP_SESSION_COOKIE } from "@/lib/seo/session";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.delete(APP_SESSION_COOKIE);
  return response;
}
