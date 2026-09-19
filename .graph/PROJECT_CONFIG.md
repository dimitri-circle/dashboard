# Project Graph Configuration

## Maximum node attempts
3

## Maximum graph iterations
25

## Post-publish cleanup policy

- Auto-clean only the current Graph Loop run's owned `tmp/` directory.
- Keep durable evidence and review artifacts.
- Treat dependencies, build caches, worktrees, sessions, and uncertain paths as review-only.
- Require verified remote publication evidence before deletion.

Only populate with repository evidence.
