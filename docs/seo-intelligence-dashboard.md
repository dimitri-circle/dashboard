# SEO Intelligence Dashboard MVP

## Overview

This repository is now a Vercel-ready Next.js App Router application backed by MongoDB. The app exposes `/api/seo/*` route handlers for integration metadata, encrypted secrets, connector tests, metric snapshots, AI-generated insights, and competitive analysis briefs.

## Setup

Create a 32-byte encryption key before saving secrets and configure MongoDB:

```bash
cp .env.example .env.local
export SEO_SECRET_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export MONGODB_URI="mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority"
export MONGODB_DB="seo_intelligence"
npm run dev
```

Optional:

```bash
export OPENAI_SEO_MODEL="gpt-4o-mini"
export PORT=3000
```

Open `http://localhost:3000`.

For Vercel, add the same values under Project Settings → Environment Variables:

- `MONGODB_URI`
- `MONGODB_DB`
- `SEO_SECRET_ENCRYPTION_KEY`
- `CRON_SECRET`
- `OPENAI_SEO_MODEL` (optional)
- `SEO_ALLOWED_CLIENT_IDS` (optional comma-separated client allow-list)
- `SEO_ADMIN_SECRET` (optional bearer token for `/api/seo/bootstrap`)

After MongoDB env vars are set, initialize indexes:

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

The dashboard includes a left sidebar for client workspaces. Users can pick an existing client or add a new client with a simple form. The selected client id is sent to every SEO API request as `x-seo-client-id`, and MongoDB reads/writes are filtered by that value. This means each client workspace has separate:

- integration metadata
- encrypted API keys
- connector status
- metric snapshots
- generated insights

The current MVP does not include login or authorization. Before production use, connect this workspace id to your auth system so users can only access client ids assigned to them.

For temporary controlled deployments, set `SEO_ALLOWED_CLIENT_IDS` to a comma-separated list such as `acme,globex`. This does not replace real auth, but it prevents arbitrary workspace ids from being accepted.

## Guided Tutorial

The dashboard includes a built-in product tour powered by React Joyride. It highlights the client sidebar, add-client form, generate button, connection status row, key integration fields, and insight feed. The implementation uses configured steps and a dark overlay so users can learn the workflow in place.

## Competitive Analysis

The dashboard includes a simple competitive analysis form. A user supplies:

- client name
- website URL
- industry
- market
- target audience
- known competitors
- target keywords
- optional notes

The backend uses the active client workspace's encrypted OpenAI token to generate a structured competitive brief. Results are stored in `seo_competitive_analyses` and scoped to the same client id as integrations and insights.

The prompt is intentionally conservative. It can reason from the client-provided industry, competitors, keywords, notes, and connector status, but it must not claim live rankings, traffic estimates, market share, or current SERP positions unless those facts are present in connected data.

## Supported Integrations

- GA4: stores `propertyId` and auth metadata. Live Data API sync is stubbed until Google OAuth credentials are configured.
- GTM: stores `accountId` and `containerId`. Live account/container validation is stubbed until Google OAuth credentials are configured.
- Hotjar: stores `siteId`, API key, or a connector URL. If a connector URL is present, the MVP tests `/health`.
- ChatGPT / OpenAI: stores an encrypted user-provided API token and uses it for insight generation.
- MCP connectors: stores remote HTTP connector config only. The MVP tests `/.well-known/oauth-protected-resource`, `/health`, and `/metadata`.

## Security Model

- Secrets are encrypted server-side with AES-256-GCM using `SEO_SECRET_ENCRYPTION_KEY` before being written to MongoDB.
- API responses use safe integration objects and do not include `encrypted_secret`.
- Secrets are not logged by the server or rendered back into the frontend.
- Expensive/mutating API routes have lightweight per-process rate limits.
- Integration saves, tests, deletes, client creation, and insight generation write audit events to `seo_audit_events`.
- Competitive analysis generation writes an audit event and stores the prompt input context, but never stores or returns the raw OpenAI token.
- MCP support is remote HTTP configuration only. The app does not execute local shell commands, spawn MCP servers, or support stdio MCP.

## Scheduled Jobs

`vercel.json` defines a daily cron job for `/api/seo/cron/daily`. The endpoint requires:

```bash
CRON_SECRET="your-random-secret"
```

The current job bootstraps storage and returns a clear message because GA4/GTM OAuth sync still needs credentials.

## MVP Limitations

- No existing auth/session layer was present, so the MVP uses a client workspace header (`x-seo-client-id`) for tenant scoping. Production should bind this to authenticated account permissions.
- GA4/GTM OAuth flows are not implemented.
- Hotjar official API support depends on future project credentials or connector availability.
- Insight quality depends on connected data. The prompt tells the model not to invent missing analytics.
- Competitive analysis is not a live web research crawler in the MVP. It works from user-provided market context and stored connector status.

## Future Roadmap

- Google Search Console OAuth
- Ahrefs / SEMrush connectors
- Scheduled sync jobs
- Anomaly detection
- Keyword-level opportunity scoring
- Core Web Vitals import
- SERP tracking
- Live competitor crawling with reviewed source attribution
- Automated task creation
