# Work Manager automation bridge

This bridge lets the existing Google Apps Script remain the collector while the CircleClick dashboard becomes the human-owned project record.

## Operational loop

```text
Slack channel or Google Meet notes
              ↓
Existing collector normalizes only work fields
              ↓
POST /api/work-manager/ingest with a shared secret
              ↓
Exact source mapping chooses one client and one Work Manager channel
              ↓
New automation-owned work updates automatically
Human-edited work receives a review suggestion and is never silently overwritten
              ↓
Team uses Start / Block / Complete / Details in the dashboard
              ↓
Read-only client review link shows only client-visible work
```

The bridge does not read Slack or Google Meet itself. It accepts normalized findings from an approved collector. It does not send email or post to Slack.

## Source mapping

Each collector source must be registered in Work Manager before its first ingest:

- `sourceKind`: `slack` or `google_meet`
- `workspaceRef`: a stable workspace key, or an empty string
- `sourceRef`: the Slack channel ID or a stable Meet-series key
- `clientId` and `channelId`: the exact destination lane

Unmatched or inactive sources fail closed; findings are never guessed into a client.

## Request

Set `WORK_MANAGER_INGEST_SECRET` to a random value of at least 24 characters in the dashboard runtime and in the collector's protected configuration. Send it as a bearer token.

```http
POST /api/work-manager/ingest
Authorization: Bearer <WORK_MANAGER_INGEST_SECRET>
Content-Type: application/json
```

```json
{
  "sourceKind": "slack",
  "workspaceRef": "circleclick",
  "sourceRef": "C0BE2423W75",
  "items": [
    {
      "externalId": "1712345678.9012",
      "title": "Publish founder interview",
      "nowText": "Final edit is ready for review.",
      "nextText": "Approve the thumbnail, then publish.",
      "ownerName": "Award",
      "status": "in_progress",
      "dueDate": "2026-09-11",
      "sourceUrl": "https://circleclick.slack.com/archives/C0BE2423W75/p17123456789012",
      "clientVisible": true
    }
  ]
}
```

Send one to 50 items per request. `externalId` must remain stable across retries; for Slack, use the message or thread timestamp. Do not send full transcripts or raw channel history.

## Status safety

- Silence, reactions, and plans are not completion evidence.
- `done` without `completionEvidenceUrl` becomes `needs_evidence`.
- `blocked` without `blockerText` becomes `unknown`.
- Automation-created rows continue to update from the same source identity.
- Once a person edits a row, later automation changes become a visible suggestion. The person chooses whether to save it.

This gives retries idempotent identities while preserving human judgment as the final authority.
