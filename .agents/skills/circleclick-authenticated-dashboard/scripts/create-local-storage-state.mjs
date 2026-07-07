#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const COOKIE_NAME = "seo_app_session";
const STORAGE_KEY = "seo-intelligence-client-id";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 12;

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3020",
    clientId: "vast",
    out: ".data/auth/circleclick-local-storage-state.json",
    role: "admin",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--base-url" && next) {
      args.baseUrl = next;
      index += 1;
    } else if (arg === "--client-id" && next) {
      args.clientId = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--env-file" && next) {
      args.envFile = next;
      index += 1;
    } else if (arg === "--email" && next) {
      args.email = next;
      index += 1;
    } else if (arg === "--role" && next) {
      args.role = next;
      index += 1;
    } else if (arg === "--help") {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  process.stdout.write(`Create a local Playwright storage-state file for CircleClick dashboard UI checks.

Usage:
  node .agents/skills/circleclick-authenticated-dashboard/scripts/create-local-storage-state.mjs \\
    --base-url http://localhost:3020 \\
    --client-id vast \\
    --out .data/auth/circleclick-local-storage-state.json

Options:
  --base-url   Local dashboard origin. Default: http://localhost:3020
  --client-id  Client workspace id to place in localStorage. Default: vast
  --out        Storage-state path. Default: .data/auth/circleclick-local-storage-state.json
  --env-file   Optional env file to load after .env.local, for disposable local auth.
  --email      Session email. Default: SEO_APP_EMAIL or dimitri@circleclick.com
  --role       Session role. Default: admin
`);
}

function parseDotEnvText(text) {
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function readLocalEnv(cwd, envFile) {
  const env = {};

  for (const filename of [".env", ".env.local"]) {
    const filePath = path.join(cwd, filename);
    if (fs.existsSync(filePath)) {
      Object.assign(env, parseDotEnvText(fs.readFileSync(filePath, "utf8")));
    }
  }

  if (envFile) {
    const filePath = path.resolve(cwd, envFile);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Env file does not exist: ${filePath}`);
    }
    Object.assign(env, parseDotEnvText(fs.readFileSync(filePath, "utf8")));
  }

  return { ...env, ...process.env };
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signPayload(encodedPayload, secret) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function createSessionCookie({ email, role, secret }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    sub: "local-playwright-admin",
    email,
    role,
    iat: now,
    exp: now + DEFAULT_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlJson(payload);
  return {
    expiresAt: payload.exp,
    value: `${encodedPayload}.${signPayload(encodedPayload, secret)}`,
  };
}

function assertLocalUrl(baseUrl) {
  const url = new URL(baseUrl);
  const host = url.hostname.toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost");

  if (!isLocal) {
    throw new Error("The signed-cookie bypass is local-only. Use a real login for preview or production.");
  }

  return url;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  const url = assertLocalUrl(args.baseUrl);
  const env = readLocalEnv(process.cwd(), args.envFile);
  const secret = env.SEO_APP_SESSION_TOKEN || env.CRON_SECRET;

  if (!secret) {
    throw new Error("Missing SEO_APP_SESSION_TOKEN or CRON_SECRET in local env.");
  }

  const email = (args.email || env.SEO_APP_EMAIL || "dimitri@circleclick.com").trim().toLowerCase();
  const role = ["admin", "operator", "viewer"].includes(args.role) ? args.role : "admin";
  const session = createSessionCookie({ email, role, secret });
  const outPath = path.resolve(process.cwd(), args.out);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        cookies: [
          {
            name: COOKIE_NAME,
            value: session.value,
            domain: url.hostname,
            path: "/",
            expires: session.expiresAt,
            httpOnly: true,
            secure: url.protocol === "https:",
            sameSite: "Lax",
          },
        ],
        origins: [
          {
            origin: url.origin,
            localStorage: [{ name: STORAGE_KEY, value: args.clientId }],
          },
        ],
      },
      null,
      2
    )
  );

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        out: outPath,
        baseUrl: url.origin,
        clientId: args.clientId,
        cookieName: COOKIE_NAME,
        expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
