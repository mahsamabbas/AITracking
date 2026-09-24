export const DEFAULT_TIMEZONE = "Asia/Karachi";

export interface TimezoneOption {
  id: string;
  label: string;
}

/** Common IANA zones for the display-timezone picker. */
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: "Asia/Karachi", label: "Pakistan (PKT)" },
  { id: "Asia/Dubai", label: "UAE (GST)" },
  { id: "Asia/Kolkata", label: "India (IST)" },
  { id: "Asia/Dhaka", label: "Bangladesh" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Asia/Tokyo", label: "Japan" },
  { id: "Europe/London", label: "United Kingdom" },
  { id: "Europe/Berlin", label: "Central Europe" },
  { id: "America/New_York", label: "US Eastern" },
  { id: "America/Chicago", label: "US Central" },
  { id: "America/Denver", label: "US Mountain" },
  { id: "America/Los_Angeles", label: "US Pacific" },
  { id: "UTC", label: "UTC" },
];

export function timezoneLabel(id: string): string {
  return TIMEZONE_OPTIONS.find((o) => o.id === id)?.label ?? id.replace(/_/g, " ");
}
