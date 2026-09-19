# Decisions

## Decision: Explicit command-only pilot
- Date: 2026-09-18
- Status: accepted
- Context: `#developer-requests` contains conversation and may contain work for multiple clients.
- Decision: Ingest only messages containing `@circleclick-task-add` and route them to an internal Developer Requests lane for human triage.
- Evidence: User explicitly requested command-based identification after approving the product-decision pass.

## Decision: No Slack posting permission for pilot
- Date: 2026-09-18
- Status: accepted
- Context: The user wants direct Slack API or webhook access without spamming the channel.
- Decision: Request only the read/event scopes needed for capture and do not post acknowledgements into Slack during the pilot.
- Evidence: Prior product decision and acceptance criteria.
