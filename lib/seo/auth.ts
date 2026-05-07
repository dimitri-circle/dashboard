import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { getSeoCollections } from "./db";

const KEY_LENGTH = 64;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
  const { appUsers } = await getSeoCollections();
  const timestamp = new Date().toISOString();
  const normalizedEmail = normalizeEmail(email);
  const { hash, salt } = hashPassword(password);
  const existing = await appUsers.findOne({ email: normalizedEmail });

  const user = {
    id: existing?.id || randomUUID(),
    email: normalizedEmail,
    password_hash: hash,
    password_salt: salt,
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  };

  await appUsers.updateOne({ email: normalizedEmail }, { $set: user }, { upsert: true });
  return { id: user.id, email: user.email };
}

export async function authenticateAppUser(email: string, password: string) {
  const { appUsers } = await getSeoCollections();
  const normalizedEmail = normalizeEmail(email);
  const user = await appUsers.findOne({ email: normalizedEmail });

  if (!user) {
    return false;
  }

  return verifyPassword(password, user.password_salt, user.password_hash);
}
