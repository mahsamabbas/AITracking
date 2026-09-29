"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { useDisplayTimezone } from "@/lib/display-timezone";
import {
  ACCENTS,
  resetPreferences,
  setPreferences,
  usePreferences,
  type Preferences,
} from "@/lib/preferences";

/** One labelled row: text on the left, control on the right (stacks on phones). */
function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-900">{title}</p>
        {hint ? <p className="hint mt-0.5 max-w-md">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? "seg-item-on" : "seg-item"}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-fast ${
        checked ? "bg-brand-solid" : "bg-slate-300 dark:bg-white/15"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-fast ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** Miniature of the portal in each theme, so the choice is visual. */
function ThemePreview({ mode }: { mode: "light" | "dark" | "split" }) {
  const light = (
    <div className="flex h-full w-full bg-[#f6f7f9]">
      <div className="w-1/4 border-r border-[#e5e7eb] bg-white" />
      <div className="flex-1 space-y-1 p-1.5">
        <div className="h-1.5 w-2/3 rounded bg-[#e5e7eb]" />
        <div className="h-4 rounded bg-white shadow-sm" />
        <div className="h-4 rounded bg-white shadow-sm" />
      </div>
    </div>
  );
  const dark = (
    <div className="flex h-full w-full bg-[#0c0e13]">
      <div className="w-1/4 border-r border-[#282d3a] bg-[#151820]" />
      <div className="flex-1 space-y-1 p-1.5">
        <div className="h-1.5 w-2/3 rounded bg-[#282d3a]" />
        <div className="h-4 rounded bg-[#151820]" />
        <div className="h-4 rounded bg-[#151820]" />
      </div>
    </div>
  );
  if (mode === "light") return light;
  if (mode === "dark") return dark;
  return (
    <div className="relative h-full w-full">
      {light}
      <div className="absolute inset-0" style={{ clipPath: "polygon(55% 0, 100% 0, 100% 100%, 45% 100%)" }}>
        {dark}
      </div>
    </div>
  );
}

const THEMES: { id: ThemePreference; label: string; preview: "light" | "dark" | "split" }[] = [
  { id: "light", label: "Light", preview: "light" },
  { id: "dark", label: "Dark", preview: "dark" },
  { id: "system", label: "System", preview: "split" },
];

/**
 * Settings → Appearance: how the portal looks and behaves on this device.
 * Stored in this browser only; nothing here changes collected data.
 */
export function AppearanceSettings() {
  const { preference, setPreference, theme } = useTheme();
  const prefs = usePreferences();
  const { label: tzLabel, orgTimezone } = useDisplayTimezone();
  const set = (patch: Partial<Preferences>) => setPreferences(patch);

  return (
    <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
      <Card>
        <CardHeader icon="sun" tone="amber" title="Theme" subtitle="Light, dark, or follow this device's setting" />
        <CardBody className="space-y-6">
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => {
              const on = preference === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPreference(t.id)}
                  className={`group rounded-xl border p-2 text-left transition-[border-color,box-shadow] duration-fast ${
                    on
                      ? "border-brand-500 shadow-[0_0_0_3px_rgb(var(--color-brand-100))]"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  <div className="aspect-[16/10] overflow-hidden rounded-lg border border-line/60">
                    <ThemePreview mode={t.preview} />
                  </div>
                  <p className="mt-2 flex items-center justify-between text-xs font-medium text-ink-900">
                    {t.label}
                    {on ? (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-solid text-[10px] text-white" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </p>
                </button>
              );
            })}
          </div>
          {preference === "system" ? (
            <p className="hint -mt-3">Following this device — currently {theme}.</p>
          ) : null}

          <div>
            <p className="text-sm font-medium text-ink-900">Accent colour</p>
            <p className="hint mt-0.5">Buttons, links, highlights and the active menu item. Chart colours stay the same.</p>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
              {ACCENTS.map((a) => {
                const on = prefs.accent === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ accent: a.id })}
                    className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-xs font-medium transition-colors duration-fast ${
                      on ? "border-ink-900 text-ink-900 dark:border-ink-700" : "border-line text-ink-700 hover:border-line-strong"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
                      style={{ background: a.swatch }}
                    >
                      {on ? "✓" : ""}
                    </span>
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-line/70">
            <Row title="Density" hint="Compact fits more on screen with tighter cards and table rows.">
              <Segmented
                label="Density"
                value={prefs.density}
                options={[
                  { id: "comfortable", label: "Comfortable" },
                  { id: "compact", label: "Compact" },
                ]}
                onChange={(density) => set({ density })}
              />
            </Row>
            <Row title="Reduce motion" hint="Turns off chart and page animations, whatever this device is set to.">
              <Switch label="Reduce motion" checked={prefs.reduceMotion} onChange={(reduceMotion) => set({ reduceMotion })} />
            </Row>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5">
        <Card>
          <CardHeader icon="clock" tone="teal" title="Date & time" subtitle="How times and days are shown to you" />
          <CardBody className="divide-y divide-line/70">
            <Row
              title="Display timezone"
              hint={`Hour and day charts use this zone.${orgTimezone ? ` Your organisation uses ${orgTimezone}.` : ""}`}
            >
              <TimezoneSelect />
            </Row>
            <Row title="Clock" hint={`Currently ${tzLabel}. Automatic follows your browser's language.`}>
              <Segmented
                label="Clock format"
                value={prefs.timeFormat}
                options={[
                  { id: "auto", label: "Automatic" },
                  { id: "12h", label: "12-hour" },
                  { id: "24h", label: "24-hour" },
                ]}
                onChange={(timeFormat) => set({ timeFormat })}
              />
            </Row>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon="trend" tone="violet" title="Dashboards" subtitle="What analytics pages do when you open them" />
          <CardBody className="divide-y divide-line/70">
            <Row title="Default date range" hint="The range pages open with. You can still change it on each page.">
              <label className="relative w-full sm:w-auto">
                <span className="sr-only">Default date range</span>
                <select
                  className="field appearance-none pr-8 sm:w-[180px]"
                  value={prefs.defaultRange}
                  onChange={(e) => set({ defaultRange: e.target.value as Preferences["defaultRange"] })}
                >
                  <option value="page">Each page&apos;s default</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden>
                  ▾
                </span>
              </label>
            </Row>
            <Row title="Live updates" hint="Refresh open dashboards automatically (every 30 seconds while the tab is visible).">
              <Switch label="Live updates" checked={prefs.liveUpdates} onChange={(liveUpdates) => set({ liveUpdates })} />
            </Row>
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3">
          <p className="hint">These settings are saved in this browser only.</p>
          <button
            type="button"
            className="btn-ghost h-8 text-xs"
            onClick={() => {
              resetPreferences();
              setPreference("system");
            }}
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
