import { NextResponse, type NextRequest } from "next/server";

const APP_SESSION_COOKIE = "seo_app_session";
const APP_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/seo/health",
  "/favicon.ico",
  "/circleclick-icon.svg",
  "/dots-pattern.webp",
  "/reactive-dot-ribbon.js",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isSignedVisitorIngest(request: NextRequest) {
  return request.method === "POST" && request.nextUrl.pathname === "/api/seo/visitor-intelligence";
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return atob(padded);
}

async function hmacSha256(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64Url(new Uint8Array(signature));
}

async function hasValidSession(cookieSession: string | undefined, configuredSession: string) {
  if (!cookieSession) {
    return false;
  }

  if (cookieSession === configuredSession) {
    return true;
  }

  const [encodedPayload, signature] = cookieSession.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = await hmacSha256(encodedPayload, configuredSession);
  if (signature !== expectedSignature) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as { exp?: number };
    const now = Math.floor(Date.now() / 1000);
    return typeof payload.exp === "number" && payload.exp > now && payload.exp <= now + APP_SESSION_MAX_AGE_SECONDS;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || isPublicPath(pathname) || isSignedVisitorIngest(request)) {
    return NextResponse.next();
  }

  const configuredSession = process.env.SEO_APP_SESSION_TOKEN || process.env.CRON_SECRET;
  const cookieSession = request.cookies.get(APP_SESSION_COOKIE)?.value;

  if (configuredSession && (await hasValidSession(cookieSession, configuredSession))) {
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
