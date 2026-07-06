---
name: dashboard-ui-ux
description: Use when designing, auditing, or implementing dashboard, admin, analytics, ops, SaaS, CRM, reporting, or data-heavy product UI. Trigger when a user mentions bad UI/UX, dashboard quality, admin screens, client workspaces, metrics pages, tables, forms, filters, charts, sidebars, cards, layout, visual hierarchy, responsive behavior, or asks to make an app look more professional.
metadata:
  author: OfRoot
  version: "0.1.0"
---

# Dashboard UI/UX Quality Gate

Use this skill to prevent weak dashboard design from shipping.

The goal is not decoration.
The goal is operational clarity.

A good dashboard lets a busy operator see:

- where they are
- what changed
- what needs attention
- what action is safe to take next
- what evidence supports the state shown

## First Principle

Dashboards are work surfaces.

Do not design them like landing pages.
Do not use hero sections, oversized empty panels, decorative card stacks, or marketing-style composition unless the screen is actually public marketing.

Internal dashboards should feel dense, calm, aligned, and repeatable.

## Required Inputs

Before changing UI, gather the smallest useful evidence:

- current rendered screenshot or browser view
- target user and job of the screen
- primary action for the screen
- current data states: loading, empty, partial, error, ready
- existing component and CSS patterns
- available viewport constraints

If the UI is already live or runnable, inspect the rendered UI. Do not rely only on code.

## System Breakdown

Start every meaningful dashboard task with this plain model:

### Inputs

What data, auth state, client selection, filters, and user intent enter the screen?

### Processing

What does the UI transform or decide?

Examples:

- summarize status
- reveal problems
- assign roles
- compare clients
- run an audit
- update configuration

### Outputs

What should the user leave with?

Examples:

- a saved setting
- a clear next action
- a trusted metric
- a narrowed list
- an exported report
- a safe destructive action

### Dependencies

Name what the UI depends on.

Examples:

- database schema
- auth role
- selected workspace
- API health
- background job state
- browser viewport

### Failure Points

Name where the UI can mislead or break.

Examples:

- hidden overflow
- stale data
- empty cards that look complete
- overlapping panels
- ambiguous role or client scope
- disabled controls without explanation
- charts without units or timestamps

## Benchmark First

For dashboard work, inspect at least three strong dashboard references before redesigning, unless the change is tiny.

Use current references when internet or browser access is available. Prefer real product dashboards and design-system guidance over inspiration galleries.

Good benchmark categories:

- payments or finance: Stripe Dashboard
- deployment and ops: Vercel Dashboard
- issue and workflow: Linear
- internal tools: Retool
- observability: Datadog, Grafana, Sentry
- product analytics: PostHog, Plausible
- database/platform admin: Supabase
- commerce admin: Shopify

Do not copy their brand.
Extract structural choices:

- navigation density
- page header shape
- table behavior
- filters
- row actions
- empty states
- status language
- responsive collapse
- typography scale

Reference principles:

- Nielsen Norman Group: dashboards should communicate important information quickly and support at-a-glance action.
- IBM/Carbon: chart titles, labels, axes, density, interaction, and chart type must match the data purpose.
- Atlassian Design System: components should be reusable building blocks for specific interaction needs.

## Dashboard Layout Model

Default to this structure for operational dashboards.

### App Shell

- stable left navigation
- current workspace visible
- current user or role visible only when useful
- sign-out and account actions separated from workspace navigation
- no scroll traps inside the nav unless unavoidable

### Page Header

- short context label
- clear page title
- one sentence explaining the job of this page
- primary action on the right when there is one
- no giant blank hero card
- no marketing hero treatment

### Status Strip

Use a compact strip for state that affects work.

Good status items:

- selected client
- data freshness
- active role
- integration status
- last run
- storage readiness
- error count

Bad status items:

- vanity counts
- repeated labels already visible elsewhere
- metrics without action
- huge pill cards that push work below the fold

### Main Work Area

Use a grid with explicit columns.

Common patterns:

- primary table plus right rail
- setup form plus test panel
- metric summary plus detail table
- run command plus result history
- list plus inspector drawer

Side panels must not overlap the primary work unless they are modal dialogs or drawers with intentional layering.

### Tables And Lists

Use tables or structured lists when the user needs to compare rows.

Rows need:

- stable columns
- visible status
- row-level action placement
- clear empty state
- clear loading state
- clear error state
- timestamps with timezone or relative meaning

Do not turn row data into a pile of decorative cards when comparison matters.

### Forms

Forms need:

- labels above fields
- readable validation
- a visible submit action
- aligned controls
- no overlap between buttons and fields
- clear disabled reasons
- success and failure feedback

Put dangerous actions away from routine save actions.

## Visual Quality Rules

### Hierarchy

One thing should be visually most important.

If everything is large, nothing is important.

Use size, weight, spacing, and position in that order. Use color sparingly.

### Density

Dashboards should be compact enough to work.

Avoid:

- oversized empty containers
- stacked hero/status/card layers
- status pills that consume full rows
- repeated explanation text
- cards inside cards
- a separate card for every small fact

### Spacing

Use a consistent spacing scale.

Default:

- 4px for tiny internal gaps
- 8px for close groups
- 16px for component padding
- 24px for section gaps
- 32px for major page separation

Avoid arbitrary one-off spacing.

### Typography

Use a restrained scale.

Default dashboard scale:

- 12px metadata
- 14px body and controls
- 16px important row labels
- 20px panel headings
- 24-32px page titles

Do not use viewport-based font sizing.
Do not use negative letter spacing.
Do not use hero-scale type inside cards or tables.

### Color

Use neutral surfaces and purposeful accents.

Color should answer:

- good
- warning
- error
- selected
- disabled
- new

Avoid:

- one-note palettes
- decorative gradients behind dense work
- bokeh, blobs, or orb backgrounds
- low-contrast gray text
- color-only status meaning

### Shape

Use modest radius.

Default card radius should be 8px or less unless the existing design system requires otherwise.

Avoid large rounded capsules for everything.

## Data Visualization Rules

Choose chart type by job:

- comparison: bar, table, ranked list
- trend: line or area
- part-to-whole: stacked bar or table before pie/donut
- distribution: histogram or box plot
- relationship: scatter
- progress against target: linear progress or bullet chart

Avoid gauges, 3D charts, ornamental pies, and charts without labels.

Every chart needs:

- concise title
- unit
- timeframe
- source or freshness when trust matters
- empty state
- error state
- accessible text summary when possible

## Admin And Safety Rules

Admin dashboards need stricter clarity.

For roles, permissions, login, billing, deletion, deployment, or database actions:

- show the current scope before the control
- name the actor role
- make irreversible actions explicit
- prefer disable/archive over delete
- require confirmation for destructive actions
- prevent last-admin lockout
- show success/failure feedback
- keep auditability in mind

If a control changes access, the user must know exactly who is affected.

## Hard Fail Conditions

Stop and redesign if any of these are true:

- text overlaps, clips, or requires hidden overflow to survive
- a panel overlaps a form or button unintentionally
- primary work starts below a giant decorative hero
- the page is mostly empty cards and status pills
- the user cannot identify the next safe action in 3 seconds
- current client/workspace/auth scope is unclear
- loading, empty, error, and success states are missing
- mobile viewport has horizontal scroll
- buttons wrap into awkward two-line labels when an icon or shorter label would work
- touch targets are too small on mobile
- charts lack units, timeframe, or labels
- color is the only status cue
- a dangerous action sits beside a routine action without separation
- a screenshot is accepted without runtime verification when the page is runnable

## Screenshot Audit Template

When the user provides a screenshot, respond with concrete observations before code.

Use this shape:

### What This Screen Is

Plainly name the screen and its job.

### What Is Failing

List the highest-impact visual or workflow failures.

Be specific.

Examples:

- the maintenance panel overlaps the login form
- the hero card consumes the first viewport without adding work value
- role reference cards compete with the actual user list
- status metrics repeat information but do not guide action

### Likely Cause

Name the layout or system cause.

Examples:

- too many independent card systems
- no stable grid contract
- right rail is positioned without respecting content width
- hero pattern reused on an admin screen

### Fix Direction

Describe the smaller replacement layout.

Examples:

- compact header plus status strip
- two-column work grid with fixed right rail
- table-first user management
- admin actions in a toolbar
- responsive collapse below 1024px

## Implementation Workflow

Follow this order.

1. Inspect the current rendered UI or screenshot.
2. Define the page job and primary action.
3. Identify the existing design tokens and component patterns.
4. Compare against at least three dashboard references when scope is more than a tiny tweak.
5. Write the layout plan before editing code.
6. Implement the smallest coherent change.
7. Verify desktop and mobile screenshots.
8. Check for overlap, clipping, horizontal scroll, and unreadable text.
9. Run relevant tests/build checks.
10. Report what changed, what was verified, and what risk remains.

## Verification Requirements

For runnable frontend work, verify at minimum:

- desktop viewport around 1440x900
- laptop viewport around 1280x800
- mobile viewport around 390x844
- hover/focus states for primary controls
- empty, loading, error, and ready states when reachable

Use browser screenshots when possible.

Do not leave generated screenshots or proof artifacts staged unless the user asks for them.

## CircleClick Dashboard Notes

For `/Users/ofroot/projects/vast_blog/circleclick`:

- Read `docs/skills/frontend.md` before UI implementation.
- Preserve useful existing anchors before changing the whole theme.
- Improve foreground information architecture before decorative background work.
- Keep app-side UI proof separate from Supabase or deployment proof.
- Do not claim data-backed panels work until storage/API evidence proves it.
- Prefer the Website Watch command-center pattern only where it helps the page job.
- Do not bulk-copy a pattern across pages if it creates oversized panels, repeated chrome, or hidden work.

## Output Contract

For meaningful dashboard work, final responses should include:

- what changed
- why the structure is better
- what was verified
- what remains unproven

Keep it short.
Use exact file paths when relevant.
