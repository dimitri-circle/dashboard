# Decisions

- Use the four fixed stages Ready → In Progress → Client Review → Done.
- Store workflow stage separately from the existing status field; status continues to represent Blocked and attention states.
- Do not guess the stage of existing blocked/needs-evidence/unknown rows; keep those rows visible in Needs placement until reviewed.
- Moving into Client Review is an explicit client-sharing action if the item is currently internal.
- Persist the row and `workflow_stage_changed` event atomically through a service-role-only database function.
- Keep Slack delivery post-commit, deduplicated by the event ID, and governed by existing source settings.
- The initial build held production changes; the user subsequently approved the CircleClick release, and the additive migration and application commit were deployed on 2026-09-29.
