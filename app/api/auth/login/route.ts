import { NextResponse } from "next/server";
import { authenticateAppUser } from "@/lib/seo/auth";
import { APP_SESSION_COOKIE, APP_SESSION_MAX_AGE_SECONDS, signAppSession } from "@/lib/seo/session";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const nextPath = String(formData.get("next") || "/");
  const expectedEmail = (process.env.SEO_APP_EMAIL || "dimitri@circleclick.com").trim().toLowerCase();
  const expectedPassword = process.env.SEO_APP_PASSWORD || process.env.CRON_SECRET;
  const sessionToken = process.env.SEO_APP_SESSION_TOKEN || process.env.CRON_SECRET;
  const redirectUrl = new URL(nextPath.startsWith("/") ? nextPath : "/", request.url);

  if (!expectedPassword || !sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "not-configured");
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  let authenticatedUser: { id: string; email: string; role: "admin" | "operator" | "viewer" } | null = null;

  try {
    const user = await authenticateAppUser(email, password);
    authenticatedUser = user ? { id: user.id, email: user.email, role: user.role } : null;
  } catch {
    authenticatedUser = null;
  }

  if (!authenticatedUser && email === expectedEmail && password === expectedPassword) {
    authenticatedUser = { id: "env-admin", email: expectedEmail, role: "admin" };
  }

  if (!authenticatedUser) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "invalid");
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  response.cookies.set(APP_SESSION_COOKIE, signAppSession(authenticatedUser, sessionToken), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: APP_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
