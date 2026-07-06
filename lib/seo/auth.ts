import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { getSeoCollections } from "./db";
import { getAppSessionFromRequest, type AppSession } from "./session";
import type { SafeSeoAppUser, SeoAppRole, SeoAppUser } from "./types";

const KEY_LENGTH = 64;
const APP_ROLES = new Set<SeoAppRole>(["admin", "operator", "viewer"]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeAppRole(role: unknown): SeoAppRole {
  return typeof role === "string" && APP_ROLES.has(role as SeoAppRole) ? (role as SeoAppRole) : "operator";
}

function isDisabled(user: Pick<SeoAppUser, "disabled_at">) {
  return Boolean(user.disabled_at);
}

function normalizeAppUser(row: SeoAppUser): SeoAppUser {
  return {
    ...row,
    role: normalizeAppRole(row.role),
    last_login_at: row.last_login_at || null,
    disabled_at: row.disabled_at || null,
  };
}

function safeAppUser(row: SeoAppUser): SafeSeoAppUser {
  const user = normalizeAppUser(row);
  const { _id: _mongoId, password_hash: _passwordHash, password_salt: _passwordSalt, ...safe } = user;
  return {
    ...safe,
    status: isDisabled(user) ? "disabled" : "active",
  };
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const { hash } = hashPassword(password, salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function upsertAppUser(email: string, password: string) {
  return saveAppUser({ email, password, role: "operator" });
}

async function activeAdminCount(exceptUserId?: string) {
  const { appUsers } = await getSeoCollections();
  const rows = await appUsers.find({ role: "admin", disabled_at: null }).toArray();
  return rows.filter((row) => row.id !== exceptUserId).length;
}

function assertUsablePassword(password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
}

export async function listAppUsers() {
  const { appUsers } = await getSeoCollections();
  const rows = await appUsers.find({}).sort({ email: 1 }).toArray();
  return rows.map(safeAppUser);
}

export async function saveAppUser({
  email,
  password,
  role,
}: {
  email: string;
  password: string;
  role?: SeoAppRole;
}) {
  const { appUsers } = await getSeoCollections();
  const timestamp = new Date().toISOString();
  const normalizedEmail = normalizeEmail(email);
  const appRole = normalizeAppRole(role);
  assertUsablePassword(password);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("A valid email is required.");
  }

  const { hash, salt } = hashPassword(password);
  const existing = await appUsers.findOne({ email: normalizedEmail });

  const user = {
    id: existing?.id || randomUUID(),
    email: normalizedEmail,
    password_hash: hash,
    password_salt: salt,
    role: appRole,
    last_login_at: existing?.last_login_at || null,
    disabled_at: existing?.disabled_at || null,
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  };

  await appUsers.updateOne({ email: normalizedEmail }, { $set: user }, { upsert: true });
  return safeAppUser(user);
}

export async function authenticateAppUser(email: string, password: string) {
  const { appUsers } = await getSeoCollections();
  const normalizedEmail = normalizeEmail(email);
  const user = await appUsers.findOne({ email: normalizedEmail });

  if (!user || isDisabled(normalizeAppUser(user))) {
    return false;
  }

  if (!verifyPassword(password, user.password_salt, user.password_hash)) {
    return false;
  }

  const timestamp = new Date().toISOString();
  const normalizedUser = normalizeAppUser(user);
  await appUsers.updateOne({ id: user.id }, { $set: { last_login_at: timestamp, updated_at: timestamp } });
  return safeAppUser({ ...normalizedUser, last_login_at: timestamp, updated_at: timestamp });
}

export async function updateAppUserAccess(
  id: string,
  payload: {
    role?: unknown;
    password?: unknown;
    disabled?: unknown;
  }
) {
  const { appUsers } = await getSeoCollections();
  const existing = await appUsers.findOne({ id });

  if (!existing) {
    throw new Error("Login user not found.");
  }

  const timestamp = new Date().toISOString();
  const current = normalizeAppUser(existing);
  const nextRole = payload.role === undefined ? current.role : normalizeAppRole(payload.role);
  const disabledRequested = typeof payload.disabled === "boolean" ? payload.disabled : isDisabled(current);

  if (current.role === "admin" && (nextRole !== "admin" || disabledRequested) && (await activeAdminCount(current.id)) === 0) {
    throw new Error("At least one active admin login is required.");
  }

  const update: Partial<SeoAppUser> = {
    role: nextRole,
    disabled_at: disabledRequested ? current.disabled_at || timestamp : null,
    updated_at: timestamp,
  };

  if (typeof payload.password === "string" && payload.password.trim()) {
    assertUsablePassword(payload.password);
    const { hash, salt } = hashPassword(payload.password);
    update.password_hash = hash;
    update.password_salt = salt;
  }

  await appUsers.updateOne({ id }, { $set: update });
  return safeAppUser({ ...current, ...update });
}

export async function getCurrentAppSession(request: Request): Promise<AppSession | null> {
  const session = getAppSessionFromRequest(request);

  if (!session || session.legacy) {
    return session;
  }

  if (session.userId === "env-admin" && session.role === "admin") {
    return {
      ...session,
      legacy: true,
    };
  }

  const { appUsers } = await getSeoCollections();
  const user = await appUsers.findOne({ id: session.userId });

  if (!user) {
    return null;
  }

  const currentUser = normalizeAppUser(user);
  if (isDisabled(currentUser)) {
    return null;
  }

  return {
    ...session,
    email: currentUser.email,
    role: currentUser.role,
  };
}

export async function requireAdminAppSession(request: Request) {
  const session = await getCurrentAppSession(request);

  if (!session) {
    throw new Error("Login required.");
  }

  if (session.role !== "admin") {
    throw new Error("Admin role required.");
  }

  return session;
}
