# Evidence

- 2026-09-29: User approved both channels, in-place replies, Graph Loop, and a brief product check.
- Product check: use one existing app and one source-thread reply per command; internal work stays hidden from status summaries.
- CircleClick workspace `T09EZFPHN`; `#developer-requests` `C072BE92C4X`; `#design-requests` `C0ATZ3A3K0X`. The design channel currently lacks the bot.
- Existing production sender is deployed; design channel enablement is not verified.
- `E-tests`: 2026-09-29 `npm test` passed, 77/77, including two-channel command parsing, exact status-client matching, privacy-safe formatting, task-description extraction, Central Time due-date parsing, and reminder guards.
- `E-build`: 2026-09-29 `npm run build` passed with both Slack routes present after the client-query repair.
- `E-diff`: 2026-09-29 `git diff --check` passed.
- `E-client-schema-fix`: Read-only local and linked CircleClick schema inspection showed `seo_clients` has no `active` column. Both command queries previously filtered on that nonexistent field; the two filters were removed before replay.
- `E-local-db-replay`: Started an isolated Supabase PostgreSQL 17/PostgREST stack with synthetic clients and source mappings; `npx tsx .graph-runs/active/20260929T134238Z-work-manager-slack-commands/tmp/slack-replay.ts` passed. It saved one task per channel to the correct client/workstream and due date, retried without a duplicate, hid internal work from status, and sent two guide posts to a mocked Slack transport with zero replay posts.
- `E-http-replay`: A signed event against local Next on port 3021 returned 200; PostgreSQL readback showed exactly one ABK task with the correct due date. A design-channel status event returned 200 and emitted one in-thread mocked Slack reply. Retrying the same event left one reply-ledger row; an altered signature returned 401. Local mock output was inspected. No real Slack message was sent.
- `E-provider-gap`: Slack's real chat.postMessage delivery is not tested in an isolated provider environment; the local mock proves formatting, targeting, and retry control but not provider acceptance. Design-channel app membership is still absent. Production enablement remains blocked.
- Read-only live inspection confirmed project `oxfpparkbduckvzsqnkl`, active developer source `C072BE92C4X`, no design source `C0ATZ3A3K0X`, and no design-channel bot membership; source setup, bot invitation, environment configuration, deployment, and a real command remain unverified release actions.
- Current scope fingerprint is SHA-256 of the ordered `shasum -a 256` output for `slack-events.ts`, `intake.ts`, `due-dates.ts`, `slack-status.ts`, `slack-intake-prompts.ts`, the Events route, `test/work-manager.test.ts`, and `.env.example`: `8d82ec493f5a74062b6117191f8aae1023e73b45c36c9822a7aa21f084f1a4fa`.
