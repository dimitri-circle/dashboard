import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");
  const nextPath = String(formData.get("next") || "/");
  const expectedPassword = process.env.SEO_APP_PASSWORD || process.env.CRON_SECRET;
  const sessionToken = process.env.SEO_APP_SESSION_TOKEN || process.env.CRON_SECRET;
  const redirectUrl = new URL(nextPath.startsWith("/") ? nextPath : "/", request.url);

  if (!expectedPassword || !sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "not-configured");
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  if (password !== expectedPassword) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "invalid");
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  response.cookies.set("seo_app_session", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/",
  });

  return response;
}
