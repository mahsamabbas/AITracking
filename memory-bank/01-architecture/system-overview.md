# System overview

```
Developer computer                         Vercel (team techlio1)                 Supabase (ap-northeast-1)
┌─────────────────────────────┐            ┌──────────────────────────────┐        ┌──────────────────────┐
│ AI agents (hooks / OTLP)    │            │ ai-tracking  = API           │        │ PostgreSQL (17 migr.) │
│ IDE companion · git repos   │──signed──▶ │ NestJS + Fastify · hnd1      │──────▶ │ Storage: activity-    │
│        │                    │  batches   │ + Vercel Cron 21:30 UTC      │        │   archive (private)   │
│ Techlio connector           │ heartbeats └──────────────▲───────────────┘        └──────────────────────┘
│ 127.0.0.1:9477–9486         │                           │ REST + JWT (polling)
└──────────────▲──────────────┘            ┌──────────────┴───────────────┐
               └── probe · claim · pause ──│ ai-tracking-bhgg = web (PWA)  │
                                           │ Next.js 15 · React 19         │
                                           └──────────────────────────────┘
Optional, not deployed: apps/worker (BullMQ + Redis) — hourly jobs, retention, Tier B pulls.
```

## Components

| Component | Code | Responsibility |
|-----------|------|----------------|
| Connector | `apps/connector` | Installs agent hooks for every supported tool on the machine, normalises signals into `ActivityEvent`s, redacts, dedupes, encrypted queue, uploads signed batches (15 s) + heartbeat (30 s), local API for the dashboard |
| IDE companion | `apps/extension` | VS Code-family extension; reports the host editor and task context to the connector |
| API | `apps/api` | Thin NestJS controllers: auth, tenant resolution, role checks → `@techlio/server-core` |
| Domain | `packages/server-core` | All business logic: ingest, sessions, hourly, event-time engine, analytics, retention, tenancy |
| Contracts | `packages/event-schema` | Zod `ActivityEvent` v1.0.0, 42 event types, provider catalogue |
| Adapters | `packages/provider-adapters` | Hook payload → events (`claudeHookToEvents`), OTLP, tool categories |
| Puller | `packages/puller` | Cursor Admin API / GitHub Copilot report clients (Tier B) |
| Aggregation | `packages/aggregation` | Interval merging + hourly durations (property-tested) |
| Web | `apps/web` | Role-aware portal, polling via `useApi`, local connector pairing, PWA |
| Worker | `apps/worker` | Optional; production runs `SKIP_REDIS=1` (inline recalculation) |

## Where to start reading code

`event-schema` (contract) → `server-core/src/ingest.ts` → `sessionize.ts` → `work-mix.ts` →
`analytics.ts` → `apps/api/src/analytics.controller.ts` → `apps/web/src/app/employees/[id]/page.tsx`.

See also: [tech-stack.md](tech-stack.md) · [data-model.md](data-model.md) ·
[api-surface.md](api-surface.md) · [auth-and-tenancy.md](auth-and-tenancy.md) ·
[analytics-engine.md](analytics-engine.md) · [../02-connector/](../02-connector/)
