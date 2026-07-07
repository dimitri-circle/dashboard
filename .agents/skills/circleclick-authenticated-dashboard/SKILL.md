---
name: circleclick-authenticated-dashboard
description: Use when verifying, screenshotting, or debugging protected CircleClick dashboard pages that require login, especially local Br(AI)N, Website Watch, admin, client workspace, or dashboard layout checks.
metadata:
  author: OfRoot
  version: "0.1.0"
---

# CircleClick Authenticated Dashboard Check

Use this skill when a dashboard page is protected by `/login` and the task is to inspect the real rendered UI.

The goal is simple:

- reach the protected dashboard safely,
- avoid exposing secrets,
- avoid weakening production auth,
- collect screenshots or DOM evidence from the real page.

## System Breakdown

### Inputs

- Dashboard URL, usually `http://localhost:<port>` for local checks.
- Optional client id, usually `vast`.
- Auth state from one of three paths:
  - an already-authenticated browser session,
  - local `.env.local` login credentials,
  - a local-only signed session cookie.

### Processing

- The dashboard proxy checks the `seo_app_session` cookie.
- The login route creates that cookie after a valid login.
- For local UI checks only, the helper script can create an equivalent signed cookie from local env secrets.

### Outputs

- A browser session on the protected dashboard.
- Screenshots or DOM measurements proving layout behavior.
- A clear note about which auth path was used.

### Dependencies

- A running local Next.js server.
- `SEO_APP_SESSION_TOKEN` or `CRON_SECRET` in local env for signed-cookie bypass.
- `SEO_APP_EMAIL` plus `SEO_APP_PASSWORD` or `CRON_SECRET` for normal local login.
- Playwright or the in-app browser tool for rendered verification.

### Failure Points

- Missing local session secret.
- Missing local storage env, which can leave the app authenticated but with `0 client workspaces`.
- Empty or encrypted Vercel env values pulled into `.env.local`.
- Browser points at `/login` instead of `/`.
- Session cookie generated for the wrong hostname.
- Treating skip-login proof as proof that auth itself works.

## Decision Rule

Choose the smallest auth path that matches the question.

1. If testing login/auth behavior, use the real login form.
2. If testing protected UI layout locally, use the local signed-cookie helper.
3. If testing production or preview auth, use a real authenticated browser session. Do not bypass login.

## Safe Auth Paths

### Path A: Existing Authenticated Browser

Use this when the user already has the dashboard open and logged in.

Steps:

1. Use the in-app browser or Chrome connector.
2. Navigate to the target dashboard page.
3. Verify the page title and active nav.
4. Capture screenshots at desktop, laptop, and mobile widths.

Do not read cookies or print tokens.

### Path B: Normal Local Login

Use this when `.env.local` has local credentials.

Steps:

1. Start the local app.
2. Open `/login?next=%2F`.
3. Fill `SEO_APP_EMAIL`.
4. Fill `SEO_APP_PASSWORD`, or `CRON_SECRET` only if the app is configured that way.
5. Submit and wait for `/`.

Never print the password or session token.

If local auth is not configured, create a disposable local auth file first:

```bash
node .agents/skills/circleclick-authenticated-dashboard/scripts/create-temp-local-auth-env.mjs \
  --out .data/auth/circleclick-local-auth.env
```

Then start the local server with that file:

```bash
set -a
. .data/auth/circleclick-local-auth.env
set +a
npm run dev -- --port 3020
```

The generated env file is a local testing credential. It lives under `.data/`, which is ignored by git.

### Path C: Local Signed Cookie Bypass

Use this for UI/layout checks only.

This skips the login form but does not change app code. It creates a Playwright storage-state file under `.data/auth/`, which is ignored by git in this repo.

Run:

```bash
node .agents/skills/circleclick-authenticated-dashboard/scripts/create-local-storage-state.mjs \
  --base-url http://localhost:3020 \
  --client-id vast \
  --env-file .data/auth/circleclick-local-auth.env \
  --out .data/auth/circleclick-local-storage-state.json
```

Then use Playwright with that storage state:

```js
const { chromium } = await import("playwright");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: ".data/auth/circleclick-local-storage-state.json",
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
await page.goto("http://localhost:3020/", { waitUntil: "networkidle" });
```

If the page still redirects to `/login`, the storage state is invalid for that host or the local env is missing a session secret.

If the page is authenticated but only shows client selection with `0 client workspaces`, auth is no longer the blocker. The local app needs valid storage env, such as `SUPABASE_URL` and the matching server-side secret, or a deliberately mocked data path for UI-only testing.

## Verification Workflow

For UI layout checks:

1. Start the local dev server.
2. Pick Path A, B, or C.
3. Navigate to the target page.
4. Verify these facts:
   - page title or heading,
   - active nav item,
   - selected client workspace,
   - no redirect to `/login`,
   - clients loaded when the target page depends on workspace data,
   - no horizontal scroll,
   - primary module is visible in the first viewport.
5. Capture:
   - desktop around `1440x900`,
   - laptop around `1280x800`,
   - mobile around `390x844`.
6. Report the auth path used and the evidence collected.

## Production Safety

Never use Path C against production or a Vercel preview.

For production or preview:

- use a real login,
- use an already authenticated browser session,
- or ask the user to grant access.

Do not weaken middleware, add public bypass routes, commit temp credentials, or print session cookies.

## Completion Proof

A complete check should say:

- auth path used,
- target URL,
- client id,
- screenshots captured,
- viewport sizes checked,
- whether the page stayed authenticated,
- whether horizontal overflow or overlap was observed.
