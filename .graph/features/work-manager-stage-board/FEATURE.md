# Work Manager stage board

## Objective
Make each workstream a Jira-like four-stage board with a sliding task drawer and durable, auditable status changes.

## Scope
- Persist `workflow_stage` independently from attention status so Blocked and Needs evidence do not erase a task's place.
- Show Ready, In Progress, Client Review, and Done columns; retain unplaced legacy items in a visible triage group.
- Move tasks with an explicit action from the board or drawer; require an explicit client-sharing choice when entering Client Review.
- Save a stage/status change and its audit event in one database transaction.
- Keep notifications and Slack delivery opt-in and downstream from the saved transition.
- Verify local UI and code, then verify the approved production migration and deployment separately.

## Product decision
Four fixed stages are used now. Blocked, Needs evidence, Needs clarification, and automation review are independent attention signals. Historic items whose original stage cannot be recovered remain in Needs placement until a person chooses a stage; the migration does not guess.

## Non-goals
Custom client stage definitions, drag-and-drop, and Slack notification policy changes.

## Current status
The board and drawer are deployed on the CircleClick production dashboard at commit `e34c752`. The linked Supabase migrations are reconciled and current. A production database transition created one audit event inside a rolled-back transaction; the original task and event count were confirmed unchanged afterward. The authenticated board-to-API save path is not yet verified in a signed-in browser session.

## Next action
Sign in to the live dashboard and verify one controlled board-to-API status save, then confirm the card and activity persist after reload without an unwanted Slack post.
