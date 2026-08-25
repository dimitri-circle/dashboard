import crypto from "node:crypto";
import type { SeoAppRole } from "./types";

export const APP_SESSION_COOKIE = "seo_app_session";
export const APP_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type AppSession = {
  userId: string;
  email: string;
  role: SeoAppRole;
  issuedAt: number;
  expiresAt: number;
  legacy?: boolean;
};

type SessionPayload = {
  v: 1;
  sub: string;
  email: string;
  role: SeoAppRole;
  iat: number;
  exp: number;
};

const ROLES = new Set<SeoAppRole>(["admin", "operator", "viewer"]);

function getSupabaseSessionSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    return "";
  }

  return crypto.createHash("sha256").update(`circleclick-dashboard-session:${secret}`).digest("base64url");
}

export function getAppSessionSecret() {
  return process.env.SEO_APP_SESSION_TOKEN || process.env.CRON_SECRET || getSupabaseSessionSecret();
}

function getFallbackEmail() {
  return (process.env.SEO_APP_EMAIL || "dimitri@circleclick.com").trim().toLowerCase();
}

function isRole(value: unknown): value is SeoAppRole {
  return typeof value === "string" && ROLES.has(value as SeoAppRole);
}

function signPayload(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

function payloadToSession(payload: SessionPayload): AppSession | null {
  const now = Math.floor(Date.now() / 1000);

  if (payload.v !== 1 || !payload.sub || !payload.email || !isRole(payload.role) || payload.exp <= now) {
    return null;
  }

  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}

export function signAppSession(
  user: { id: string; email: string; role: SeoAppRole },
  secret = getAppSessionSecret(),
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!secret) {
    throw new Error("SEO_APP_SESSION_TOKEN or CRON_SECRET is required for dashboard sessions.");
  }

  const payload: SessionPayload = {
    v: 1,
    sub: user.id,
    email: user.email.trim().toLowerCase(),
    role: user.role,
    iat: nowSeconds,
    exp: nowSeconds + APP_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function verifyAppSessionCookie(value: string | null | undefined, secret = getAppSessionSecret()) {
  if (!value || !secret) {
    return null;
  }

  if (value === secret) {
    const now = Math.floor(Date.now() / 1000);
    return {
      userId: "env-admin",
      email: getFallbackEmail(),
      role: "admin" as const,
      issuedAt: now,
      expiresAt: now + APP_SESSION_MAX_AGE_SECONDS,
      legacy: true,
    };
  }

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    return payloadToSession(payload);
  } catch {
    return null;
  }
}

export function getAppSessionFromRequest(request: Request) {
  const cookieValue = readCookie(request.headers.get("cookie"), APP_SESSION_COOKIE);
  return verifyAppSessionCookie(cookieValue);
}
