# UI design system and responsive rules

Spec for IA and motion: `apps/web/UX_SPEC.md`. Tokens: `apps/web/src/app/globals.css`.

## Tokens
- Colours as RGB CSS variables (`--color-canvas/card/raised/line/ink-*/brand-*`), redefined in
  `html.dark` and per accent `html[data-accent=…]` (+ dark variants). Never hard-code colours;
  there is no `text-ink-600/800`.
- Chart series `--chart-1…6`, `--chart-idle/grid/axis` — stay fixed across accents.
- Motion `--motion-fast/normal/slow`; collapse to 0 under OS reduce-motion or `data-motion=reduce`.
- Density: `html[data-density=compact]` tightens `.card-body`, `.card-head`, `.stat-tile`, table rows.

## Components & classes
`.card` (rounded-2xl), `.card-head`, `.stat-tile` (accent top line via `--tile-accent`), `.seg` /
`.seg-item(-on)` (also used by `Tabs`), `.tbl`, `.table-scroll`, `.badge-*`, `.icon-chip-*`,
`.code-snippet`. `CardHeader` takes `icon/tone/help`; `Callout` action wraps below text on phones.

## Charts (`components/charts/ChartFrame.tsx`)
- Every chart draws in an absolutely positioned layer: it fills a stretched card (no blank band
  under a chart next to a taller card) and is never shorter than its `height`.
- `minWidth` = narrowest readable width; below 1024 px the chart scrolls sideways
  (`.chart-scroll`, `.chart-min`) with a "Swipe sideways" hint under 640 px. Desktop always fits.
  Workday 720, hour pattern 420, trends `trendMinWidth(points)` (none for ≤ 10 days).

## Responsive rules
- `.grid > * { min-width: 0 }` globally — prevents grid column blow-out.
- Stat tiles two-up on phones; filters full width below `sm`; wide tables scroll inside `.table-scroll`.
- Sticky filter bar only on `lg+` (opaque + hairline + shadow under `--header-h`).
- iOS: 16 px form fields on touch; safe-area insets in standalone PWA.
- Verified 2026-09-30: no page overflows at 390 px or 768 px (admin + developer pages).

## States
Six PRD empty-state variants, skeletons, error with retry; "Not available from provider" for
unreported metrics (never 0).
