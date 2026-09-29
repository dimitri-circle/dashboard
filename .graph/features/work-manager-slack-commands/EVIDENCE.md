# Evidence

- 2026-09-29: User approved both channels, in-place replies, Graph Loop, and a brief product check.
- Product check: use one existing app and one source-thread reply per command; internal work stays hidden from status summaries.
- CircleClick workspace `T09EZFPHN`; `#developer-requests` `C072BE92C4X`; `#design-requests` `C0ATZ3A3K0X`. The design channel currently lacks the bot.
- Existing production sender is deployed; design channel enablement is not verified.
- Scope fingerprint initially covers the existing event router, intake, date parser, prompt sender, and webhook route. Refresh after edits and tests.
- `E-tests`: 2026-09-29 `npm test` passed, 72/72, including two-channel command parsing, exact status-client matching, privacy-safe formatting, task-description extraction, and Central Time due-date parsing.
- `E-build`: 2026-09-29 `npm run build` passed with the Slack Events route present.
- `E-diff`: 2026-09-29 `git diff --check` passed.
- `E-local-db-gap`: Linked production is PostgreSQL 17.6 and contains the prompt ledger; local Docker/Colima is stopped, Homebrew PostgreSQL is 14.20, and disk has only 911 MiB free, so no matching isolated database or real Slack replay was run. Production was not changed.
- Read-only live inspection confirmed project `oxfpparkbduckvzsqnkl`, active developer source `C072BE92C4X`, no design source `C0ATZ3A3K0X`, and no design-channel bot membership; source setup, bot invitation, environment configuration, deployment, and a real command remain unverified release actions.
- Current scope fingerprint is SHA-256 of the ordered `shasum -a 256` output for `slack-events.ts`, `intake.ts`, `due-dates.ts`, `slack-status.ts`, `slack-intake-prompts.ts`, the Events route, `test/work-manager.test.ts`, and `.env.example`: `c27105e33bffa3678684f98734ae4056cd1a01f74107b8301367f4773435e887`.
