# Feature: Developer Requests Slack API Intake

## Status
In progress

## Objective
Allow a user in Slack `#developer-requests` to add exactly one internal Work Manager task by sending a message containing `@circleclick-task-add`, using direct Slack API or Events API access without posting back into Slack.

## Acceptance criteria

- Only messages from the registered CircleClick workspace and `#developer-requests` channel are accepted.
- Only messages containing the explicit `@circleclick-task-add` command enter the pilot intake path.
- The Slack message timestamp is the stable external ID, so delivery and hourly retry do not duplicate work.
- New work lands in an internal CircleClick Operations / Developer Requests lane and is not client-visible by default.
- The saved task retains a link to the original Slack message.
- A dismissed task is not recreated by later retries.
- The integration does not post into Slack during the pilot.
- Production database, Slack app, deployment, and enablement changes remain separately authorized and verified.

## Non-goals

- Passive ingestion of all channel conversation.
- Slack commands for completing, blocking, or dismissing existing work.
- Automatic client assignment without human confirmation.
- Slack bot replies during the pilot.

## Next bounded action
Complete Slack developer portal sign-in, inventory reusable CircleClick apps and scopes, then implement the signed Events API endpoint without changing production permissions.

## Last reviewed
2026-09-18
