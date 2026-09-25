/**
 * One stroke-icon set for the dashboard (20×20 grid, 1.6 stroke), so card
 * headers, stat tiles, and highlights share a visual language without an
 * icon dependency.
 */
const PATHS = {
  clock: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM10 6.5V10l2.5 1.5",
  sessions: "M4 5h12v8H4zM7 16h6M10 13v3",
  people: "M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M13.5 8.5a2 2 0 1 0 0-4M14 12c2 .3 3.5 1.7 3.5 4",
  person: "M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5",
  shield: "M10 3 4 5.5v4c0 3.6 2.5 6.6 6 7.5 3.5-.9 6-3.9 6-7.5v-4L10 3ZM10 7.5v3M10 13h.01",
  trend: "M3 14l4-4 3 3 6-6M12 7h4v4",
  pie: "M10 3v7h7a7 7 0 1 1-7-7ZM13 3.5A7 7 0 0 1 16.5 7H13V3.5Z",
  file: "M5 3h7l3 3v11H5V3ZM12 3v3h3M7.5 10h5M7.5 13h3",
  commit: "M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 10h4.5M12.5 10H17",
  ship: "M10 3v9M6.5 8.5 10 12l3.5-3.5M4 15.5h12",
  repo: "M5 4.5A1.5 1.5 0 0 1 6.5 3H15v12H6.5A1.5 1.5 0 0 0 5 16.5v-12ZM5 16.5A1.5 1.5 0 0 0 6.5 18H15M8 6h4",
  tool: "M12.5 3.5a3.5 3.5 0 0 0-3.3 4.6L3.5 13.8 6.2 16.5l5.7-5.7a3.5 3.5 0 0 0 4.6-3.3l-2 2-2-.5-.5-2 2-2a3.5 3.5 0 0 0-1.5-.5Z",
  team: "M3 16v-1.5A2.5 2.5 0 0 1 5.5 12h2A2.5 2.5 0 0 1 10 14.5V16M10 16v-1.5a2.5 2.5 0 0 1 2.5-2.5h2a2.5 2.5 0 0 1 2.5 2.5V16M6.5 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM13.5 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  sun: "M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4",
  calendar: "M4 5h12v11H4zM4 8.5h12M7 3v3M13 3v3",
  bolt: "M11 2.5 4.5 11H10l-1 6.5L15.5 9H10l1-6.5Z",
  spark: "M10 3v3M10 14v3M3 10h3M14 10h3M5.5 5.5l2 2M12.5 12.5l2 2M5.5 14.5l2-2M12.5 7.5l2-2",
  live: "M10 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM6.5 6.5a5 5 0 0 0 0 7M13.5 6.5a5 5 0 0 1 0 7M4 4a8.5 8.5 0 0 0 0 12M16 4a8.5 8.5 0 0 1 0 12",
  plug: "M7 3v4M13 3v4M5.5 7h9v4a4.5 4.5 0 0 1-9 0V7ZM10 15.5V18",
  list: "M7 5.5h9M7 10h9M7 14.5h9M4 5.5h.01M4 10h.01M4 14.5h.01",
  trophy: "M6 3.5h8V8a4 4 0 0 1-8 0V3.5ZM6 5H3.5v1.5A2.5 2.5 0 0 0 6 9M14 5h2.5v1.5A2.5 2.5 0 0 1 14 9M10 12v3M7 17h6",
  target: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM10 10h.01",
  model: "M10 3.5 16 7v6l-6 3.5L4 13V7l6-3.5ZM4 7l6 3.5L16 7M10 10.5v6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type Tone = "brand" | "teal" | "amber" | "rose" | "slate" | "violet" | "sky";

/** Full class names (not templated) so Tailwind keeps them in the build. */
const TONE_CLASS: Record<Tone, string> = {
  brand: "",
  teal: "icon-chip-teal",
  amber: "icon-chip-amber",
  rose: "icon-chip-rose",
  slate: "icon-chip-slate",
  violet: "icon-chip-violet",
  sky: "icon-chip-sky",
};

export function IconChip({ name, tone = "brand", size = "md" }: { name: IconName; tone?: Tone; size?: "sm" | "md" }) {
  const toneClass = TONE_CLASS[tone];
  const sizeClass = size === "sm" ? "!h-7 !w-7" : "";
  return (
    <span className={`icon-chip ${toneClass} ${sizeClass}`}>
      <Icon name={name} className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </span>
  );
}
