# SEO Intelligence Dashboard MVP

## Overview

This repository is now a Vercel-ready Next.js App Router application backed by Supabase Postgres. The app exposes `/api/seo/*` route handlers for integration metadata, encrypted secrets, connector tests, metric snapshots, AI-generated insights, and competitive analysis briefs.

## Setup

Create a 32-byte encryption key before saving secrets and configure Supabase:

```bash
cp .env.example .env.local
export SEO_SECRET_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SECRET_KEY="sb_secret_or_service_role_key"
npm run dev
```

Optional:

```bash
export OPENAI_SEO_MODEL="gpt-4o-mini"
export SEO_COMPETITOR_SEARCH_ENDPOINT=""
export SEO_COMPETITOR_SEARCH_API_KEY=""
export PORT=3000
```

Open `http://localhost:3000`.

For Vercel, add the same values under Project Settings → Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY` for legacy projects)
- `SEO_SECRET_ENCRYPTION_KEY`
- `CRON_SECRET`
- `OPENAI_SEO_MODEL` (optional)
- `SEO_COMPETITOR_SEARCH_ENDPOINT` (optional competitor discovery provider)
- `SEO_COMPETITOR_SEARCH_API_KEY` (optional competitor discovery provider token)
- `SEO_ALLOWED_CLIENT_IDS` (optional comma-separated client allow-list)
- `SEO_ADMIN_SECRET` (optional bearer token for `/api/seo/bootstrap`)
- `SEO_APP_EMAIL` (dashboard login email, defaults to `dimitri@circleclick.com`)
- `SEO_APP_PASSWORD` (recommended dashboard login password; falls back to `CRON_SECRET` if omitted)
- `SEO_APP_SESSION_TOKEN` (recommended random token stored in the login cookie; falls back to `CRON_SECRET` if omitted)

Apply the database schema before using the dashboard:

```bash
supabase db push
```

After Supabase env vars are set and the schema exists, bootstrap the app data:

```bash
curl -X POST http://localhost:3000/api/seo/bootstrap
```

If `SEO_ADMIN_SECRET` is set:

```bash
curl -X POST http://localhost:3000/api/seo/bootstrap \
  -H "Authorization: Bearer $SEO_ADMIN_SECRET"
```

Check environment readiness without exposing secret values:

```bash
curl http://localhost:3000/api/seo/health
```

## Client Workspaces

The dashboard opens with a client selection stage. If no clients exist, it only asks for the first client. After a client exists, the dashboard shows Overview, Tool Setup, Competitive Analysis, and Insights. Tool Setup is split into focused setup pages for GA4, GTM, Hotjar, ChatGPT / OpenAI, and MCP so users can configure one connector at a time. The selected client id is sent to every SEO API request as `x-seo-client-id`, and Supabase reads/writes are filtered by that value. This means each client workspace has separate:

- integration metadata
- encrypted API keys
- connector status
- metric snapshots
- generated insights

The current MVP includes a simple email/password login backed by Supabase table `seo_app_users`. Passwords are stored as salted hashes, not plaintext. The env vars `SEO_APP_EMAIL`, `SEO_APP_PASSWORD`, and `SEO_APP_SESSION_TOKEN` remain as a fallback so existing deployments do not lock themselves out. This protects the app shell and SEO API routes with an HTTP-only cookie. Before broader production use, replace this with account-level auth so users can only access client ids assigned to them.

For temporary controlled deployments, set `SEO_ALLOWED_CLIENT_IDS` to a comma-separated list such as `acme,globex`. This does not replace real auth, but it prevents arbitrary workspace ids from being accepted.

## Guided Tutorial

The dashboard includes a built-in product tour powered by React Joyride. It highlights the overview, sidebar, client switcher, focused Tool Setup entry point, tool page picker, competitive analysis, and insight feed. The implementation uses configured steps and a dark overlay so users can learn the workflow in place. The tutorial copy now explains that connector setup is separated by tool instead of showing every setup form on one screen.

## Competitive Analysis

The dashboard includes a simple competitive analysis form. A user supplies only the company name.

When OpenAI is connected through the dashboard or `OPENAI_API_KEY`, the backend first auto-fills the research brief: likely website URL, industry, market, target audience, competitors, and search topics. It stores uncertainty as report assumptions. The crawler then verifies public pages where URLs are available. It fetches the homepage plus obvious internal pages such as pricing, services, case studies, blog, FAQ, contact, demo, and comparison pages. It extracts visible titles, descriptions, headings, navigation labels, calls to action, schema types, and normalized website features.

The deterministic comparison defines "top performers" as the crawled competitor sites with the strongest observed feature coverage in this run. It does not claim traffic, rankings, revenue, market share, or SERP position. The report stores missing client patterns, shared patterns, client strengths, top performers, and crawl evidence in `seo_competitive_analyses`.

If `SEO_COMPETITOR_SEARCH_ENDPOINT` and `SEO_COMPETITOR_SEARCH_API_KEY` are configured, the backend may request extra competitor suggestions from that provider. OpenAI-inferred URLs remain subject to crawl verification.

OpenAI also summarizes the already-collected crawl evidence. If no token is connected, or if OpenAI fails, the deterministic crawl report still succeeds and is stored with assumptions explaining what could not be auto-filled.

## Supported Integrations

- GA4: stores `propertyId` plus encrypted access-token or service-account JSON credentials. The sync endpoint calls the Google Analytics Data API, stores 28-day trend snapshots, and stores top-page page-view rows for dashboard graphs.
- GTM: stores `accountId` and `containerId`. Live account/container validation is stubbed until Google OAuth credentials are configured.
- Hotjar: stores `siteId`, API key, or a connector URL. If a connector URL is present, the MVP tests `/health`.
- ChatGPT / OpenAI: stores an encrypted user-provided API token and uses it for insight generation plus optional competitive-report summaries.
- MCP connectors: stores remote HTTP connector config only. The MVP tests `/.well-known/oauth-protected-resource`, `/health`, and `/metadata`.

## Security Model

- Secrets are encrypted server-side with AES-256-GCM using `SEO_SECRET_ENCRYPTION_KEY` before being written to Supabase.
- API responses use safe integration objects and do not include `encrypted_secret`.
- Secrets are not logged by the server or rendered back into the frontend.
- Expensive/mutating API routes have lightweight per-process rate limits.
- Integration saves, tests, deletes, client creation, and insight generation write audit events to `seo_audit_events`.
- Competitive analysis generation writes an audit event and stores crawl evidence plus sanitized prompt input context, but never stores or returns the raw OpenAI token.
- MCP support is remote HTTP configuration only. The app does not execute local shell commands, spawn MCP servers, or support stdio MCP.

## Scheduled Jobs

`vercel.json` defines a daily cron job for `/api/seo/cron/daily`. The endpoint requires:

```bash
CRON_SECRET="your-random-secret"
```

The current job bootstraps storage. Manual GA4 syncing is available from the overview once GA4 credentials are saved for the active client.

## MVP Limitations

- No existing auth/session layer was present, so the MVP uses a client workspace header (`x-seo-client-id`) for tenant scoping. Production should bind this to authenticated account permissions.
- GA4 OAuth flows are not implemented. Use a temporary access token or service-account JSON with read access to the GA4 property.
- GTM OAuth flows are not implemented.
- Hotjar official API support depends on future project credentials or connector availability.
- Insight quality depends on connected data. The prompt tells the model not to invent missing analytics.
- Competitive crawling is intentionally shallow and evidence-first. It fetches HTML only, executes no scripts, caps pages and bytes, and may miss content rendered only on the client.

## Future Roadmap

- Google Search Console OAuth
- Ahrefs / SEMrush connectors
- Scheduled sync jobs
- Anomaly detection
- Keyword-level opportunity scoring
- Core Web Vitals import
- SERP tracking
- Deeper competitor crawling with reviewed source attribution
- Automated task creation
