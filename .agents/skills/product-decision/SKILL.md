---
name: product-decision
description: Use when deciding whether to build, change, ship, remove, or redesign a product feature, workflow, admin surface, dashboard, onboarding step, automation, integration, or user-facing behavior. Trigger when the user asks about product direction, practical UX, feature scope, roadmap choices, tradeoffs, "better way", "should we", or before meaningful edits/new features when the user opts in.
metadata:
  author: OfRoot
  version: "0.1.0"
---

# Product Decision Gate

Use this skill to make product choices explicit before implementation.

The goal is not to slow work down.
The goal is to avoid shipping features that are unclear, hard to use, hard to support, or misaligned with the real job.

## First Principle

Every product change should make one user job easier.

If the job is unclear, stop and define it.

## When To Run

Run this skill when the user asks for product judgment or when the user says to run the product decision gate.

Before meaningful edits or new features, ask:

> Do you want me to run the product decision gate before I implement this?

If the user says yes, run this skill.
If the user says no or asks for speed, continue without it and keep scope tight.

Do not ask for tiny fixes:

- typo fixes
- copy-only polish
- test fixes
- mechanical refactors
- dependency or build fixes
- bug fixes with an obvious expected behavior

## Decision Model

Start with the plain product system.

### User

Who is using this?

Examples:

- client
- internal operator
- admin
- founder
- support
- implementation engineer

### Job

What are they trying to get done?

Use plain language.

Examples:

- assign access safely
- compare client readiness
- understand why a report failed
- publish a clean article
- connect a tool
- identify a production blocker

### Current Friction

What makes the job slow, confusing, risky, or impossible now?

Name the concrete behavior, not a vague feeling.

### Desired Outcome

What should be measurably easier after the change?

Examples:

- fewer clicks
- fewer repeated decisions
- safer access changes
- faster comparison
- clearer error recovery
- fewer support questions

### Non-Goals

What are we intentionally not solving?

This keeps the feature from expanding silently.

## Options

Generate at least three options for non-trivial changes.

Use this shape:

1. Minimal fix
2. Practical product fix
3. Larger system fix

For each option, state:

- user benefit
- implementation cost
- operational risk
- what it leaves unsolved

Default recommendation should usually be the practical product fix.

## Decision Criteria

Score the options against these questions:

- Does it make the primary job faster?
- Does it make the system easier to understand?
- Does it reduce repeated work?
- Does it reduce support burden?
- Does it improve safety or reversibility?
- Does it preserve existing useful behavior?
- Can it be verified with a screenshot, test, API response, database state, or production check?
- Can it be rolled back cleanly?

## Product Risk Checklist

Before implementation, name the highest risks.

Common risks:

- solving for the wrong user
- adding UI that looks complete but hides missing data
- making comparison harder
- adding too many controls at once
- changing access or permissions without clear scope
- breaking mobile or small laptop workflows
- creating a feature that cannot be observed in production
- coupling unrelated workflows
- making rollback difficult

## Output Format

For a meaningful product decision, produce:

### Decision

One sentence.

### Why

Plain cause and effect.

### Options Considered

Short list of alternatives and tradeoffs.

### Recommended Scope

What to build now.

### Non-Goals

What not to build now.

### Proof Required

What evidence will show this worked.

Examples:

- desktop and mobile screenshots
- passing tests
- production build
- API response
- database migration state
- live deployment status

### Rollback

How to undo it if wrong.

## Implementation Rule

After the decision, implement the smallest coherent version.

Do not combine unrelated product decisions into one change.

If the user changes direction, update the decision before continuing.

## Completion Rule

When done, report:

- what decision was made
- what changed
- what proof passed
- what remains unproven
