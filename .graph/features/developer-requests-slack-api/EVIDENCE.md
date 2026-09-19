# Evidence

## Evidence: Existing command parser
- Date: 2026-09-18
- Graph node: inspect-current-path
- Command or verification method: Source inspection of `lib/work-manager/intake.ts` and `docs/work-manager-automation.md`.
- Result: The dashboard already recognizes `@circleclick-task-add`, bounds batches to 1-50 messages, and uses the source mapping plus stable external IDs for ingestion.
- Exit status: 0
- Remaining uncertainty: The direct Slack Events/API connection and `#developer-requests` source mapping are not verified.

## Evidence: Existing production source boundary
- Date: 2026-09-18
- Graph node: inspect-current-path
- Command or verification method: Authenticated production dashboard network readback.
- Result: The only observed active Slack source maps workspace `T09EZFPHN`, channel `C0BE2423W75`, to ABK Labs / Video Queue. No `#developer-requests` mapping was observed.
- Exit status: 0
- Remaining uncertainty: The Slack channel ID for `#developer-requests` and Slack app credentials/scopes remain unknown.

## Evidence: Developer Requests channel identity
- Date: 2026-09-18
- Graph node: inspect-current-path
- Command or verification method: Read-only Slack desktop navigation and channel URL inspection.
- Result: CircleClick workspace ID is `T09EZFPHN`; `#developer-requests` channel ID is `C072BE92C4X`.
- Exit status: 0
- Remaining uncertainty: Whether an existing CircleClick Slack app already has suitable Events API configuration and scopes.

## Evidence: Slack app inventory blocked at authentication
- Date: 2026-09-18
- Graph node: inspect-current-path
- Command or verification method: Opened the official Slack app-management portal with the CircleClick account and initiated sign-in.
- Result: Slack presented a CAPTCHA before app inventory could be inspected. No app, scope, token, signing secret, or workspace permission was created or changed.
- Exit status: blocked
- Remaining uncertainty: Existing app ownership, signing secret availability, bot membership, and OAuth scopes.

## Evidence: Signed Slack Events component
- Date: 2026-09-18
- Graph node: implement-command-intake
- Command or verification method: `npm test` and `npm run build` in the feature worktree.
- Result: Added `lib/work-manager/slack-events.ts` and `/api/work-manager/slack/events`; fresh signature, replay rejection, workspace/channel filtering, explicit command filtering, source permalink generation, and fast acknowledgment are covered by automated tests. The route is public only at its exact event path and emits no Slack message.
- Exit status: 0
- Remaining uncertainty: No real Slack callback has reached the endpoint; `after()` processing, production secrets, source mapping, database state, app installation, and bot membership remain unverified.

## Evidence: Scope fingerprint
- Date: 2026-09-18
- Graph node: validate-isolated-flow
- Command or verification method: SHA-256 over the affected source, test, environment-example, and package manifest paths.
- Result: `4edaf91fd42f8e3f54be8da8edbcc64531b566e4b041e2d61087b9eabf82fb5a`.
- Exit status: 0
- Remaining uncertainty: This is source/config provenance, not deployment or runtime proof.

## Evidence: Storage reconciliation prepared
- Date: 2026-09-19
- Graph node: repair-storage-and-errors
- Command or verification method: Source review and `supabase migration new work_manager_schema_reconciliation`.
- Result: Prepared a reversible migration for the observed Work Manager fields, dismissal metadata, automation review metadata, constraints, and indexes. Updated API error normalization to preserve Supabase message, details, and hint.
- Exit status: 0
- Remaining uncertainty: The migration is not applied. Supabase CLI has no linked CircleClick project and the visible project inventory did not include one, so target identity and remote schema remain unproven.
