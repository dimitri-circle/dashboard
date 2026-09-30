# Feature: Work Manager Slack commands

## Objective

Accept `@task-add` and `@task-status` only in CircleClick `#developer-requests` and `#design-requests`, with one reply in the originating thread and no cross-post.

## Product decision

Reuse the existing Slack app and Work Manager storage. Keep the old add command as a compatibility alias, require an explicit client and due date before task creation, and show only client-visible work in status replies. Do not scan other channels or expose internal tasks.

## Acceptance

- Both channel IDs are explicitly allowlisted, with signed Slack requests only.
- New add syntax parses a Central Time due date and exact case-insensitive client; missing details produce one bounded help reply.
- Status resolves an exact client and returns only safe client-visible statuses and links.
- A repeated Slack event cannot create duplicate work or duplicate replies.
- Replies stay in the source thread; no cross-channel broadcast.
- Isolated component and connection tests precede any production enablement.

## Non-goals

- Passive scanning, DM commands, inferred client assignment, or automatic client-document writes.
