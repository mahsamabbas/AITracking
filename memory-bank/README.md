# Memory bank — Techlio Pulse

The project's long-term memory: what we are building, how it is built, why it
is built that way, and where it stands. Read it before changing anything
non-trivial; update it in the same change when a fact here stops being true.

**Last full review:** 2026-09-30

## Read order for someone new

1. [00-overview/project-brief.md](00-overview/project-brief.md) — the one-paragraph mission
2. [00-overview/product-context.md](00-overview/product-context.md) — roles, portals, non-goals
3. [01-architecture/system-overview.md](01-architecture/system-overview.md) — the moving parts
4. [01-architecture/system-patterns.md](01-architecture/system-patterns.md) — rules that must not break
5. [06-status/active-context.md](06-status/active-context.md) — what is true *right now*
6. [06-status/backlog.md](06-status/backlog.md) — what is left

## Map

| Folder | What lives there |
|--------|------------------|
| [00-overview/](00-overview/) | Mission, product context, roles, glossary of the terms used everywhere |
| [01-architecture/](01-architecture/) | System overview, tech stack, data model, API surface, auth & tenancy, analytics engine, invariants |
| [02-connector/](02-connector/) | The desktop connector: service model per OS, AI-tool integrations (hooks), installers & release |
| [03-frontend/](03-frontend/) | Web app structure, data fetching/polling, design system, responsive rules, appearance settings |
| [04-operations/](04-operations/) | Environments & deployment, data retention, security posture, runbook |
| [05-requirements/](05-requirements/) | PRD v0.2 extract (the product contract) |
| [06-status/](06-status/) | Active context, dated progress log, backlog, decision log |

## Update rules

- **Facts, not plans.** Only write what exists in the code or was decided. Plans go in the backlog.
- **One home per fact.** Link instead of copying; if two files disagree, fix both in the same change.
- **Date every status statement** (`YYYY-MM-DD`). Relative dates ("yesterday") rot.
- **Progress log is append-only** (newest at the bottom). Active context is rewritten, not appended.
- **Decisions** go in [06-status/decisions.md](06-status/decisions.md) with the reason — especially
  anything a future developer might "fix" back.
- **Never store secrets** (passwords, keys, tokens, connection strings) here. Names of env vars only.

## Related documentation outside this folder

- `docs/Techlio-Pulse-Project-Documentation.pdf` — 36-page architecture handbook (2026-09-30)
- `docs/adr/` — architecture decision records · `docs/ops/runbook.md` · `docs/policy/` — notice & open decisions
- `apps/web/UX_SPEC.md` — UI information architecture and motion rules
