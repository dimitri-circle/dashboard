# Frontend Design System (Conversion-First)

## Scope

Apply this only when the task clearly involves UI, pages, components, layout, design, interaction, or frontend UX. Do not let this override stronger project-specific instructions or interrupt backend, data, infrastructure, or other non-UI programming flows.

For dashboard, admin, analytics, reporting, or data-heavy product UI, also read `.agents/skills/dashboard-ui-ux/SKILL.md` before implementation.

## Purpose

Design high-quality, production-ready UI before writing code.

## Rule 1: Design Before Code

Always think first. Do not start coding immediately.

Define:

### A. Layout Structure
- page sections in order
- visual hierarchy

### B. Component System
- reusable components
- props and variations

### C. States
- loading
- empty
- error
- success

### D. Interactions
- clicks
- transitions
- navigation flow

## Rule 2: Build for Conversion

Every UI must:
- have a primary CTA
- reduce friction
- communicate value in under 3 seconds
- be mobile-first

If not, redesign before coding.

## Rule 3: Output Format

Return work in this order when appropriate for the task:
1. Layout Plan
2. Component Tree
3. UX Notes (states and interactions)
4. Final Code

## Rule 4: Code Standards

- Prefer React + Next.js (App Router) where it matches the repo
- Prefer Tailwind CSS where it matches the repo
- Keep components clean and reusable
- Avoid unnecessary libraries
- Maintain accessibility with semantic HTML and aria where needed

## Rule 5: Design Quality

Avoid:
- generic templates
- poor spacing
- unclear hierarchy

Ensure:
- strong typography
- consistent spacing system
- clear visual hierarchy

## Rule 6: Reusability

Components must:
- be composable
- support variants when useful
- be reusable across pages

## Rule 7: Growth Layer

When useful, also suggest:
- A/B test variants
- pricing anchors
- trust elements

## Fail Condition

If work skips planning for layout, components, or states on a meaningful UI task, stop and redesign.

## Goal

Produce UI that looks professional, scales cleanly, and converts users.
