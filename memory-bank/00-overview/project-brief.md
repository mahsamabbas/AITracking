# Project brief

**Product:** Techlio Pulse — AI activity monitoring dashboard for Techlio and its customer
organisations (multi-tenant).

**Objective:** Show managers how AI coding agents — Claude Code, Cursor, GitHub Copilot,
Windsurf, Antigravity, Gemini CLI, Codex CLI, Devin CLI — are actually used across the
organisation, and let them drill from an org-wide view down to a single agent operation,
without timesheets, billing, or behaviour scoring.

**Core workflow:** Organisation → Employees → Employee details → AI tool →
Sessions → Individual session details.

**Scope boundary:** Observes connected AI agent activity only. The hourly summary
remains the authoritative reporting unit for compliance purposes; the session is
the unit managers actually navigate. Missing telemetry is a coverage gap, never
evidence of inactivity.

**Platforms:** connector for macOS (`.pkg`), Windows (`.exe`) and Linux (`.tar.gz` +
one-line installer). Dashboard is a web app / installable PWA.

**Sponsor:** Mahsam (CEO) · **PO:** Faisal (Manager)
**Repository:** `mahsamabbas/AITracking` · **Production:** https://techlio-pulse.vercel.app
