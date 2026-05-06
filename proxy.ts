import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/seo/health",
  "/favicon.ico",
  "/dots-pattern.webp",
  "/reactive-dot-ribbon.js",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const configuredSession = process.env.SEO_APP_SESSION_TOKEN || process.env.CRON_SECRET;
  const cookieSession = request.cookies.get("seo_app_session")?.value;

  if (configuredSession && cookieSession === configuredSession) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
