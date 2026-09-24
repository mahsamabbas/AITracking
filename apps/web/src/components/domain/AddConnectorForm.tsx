"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Callout } from "@/components/ui/Callout";
import { PasswordField } from "@/components/ui/PasswordField";
import { claimLocalConnector } from "@/components/domain/ConnectThisComputer";
import { providerLabel } from "@/lib/providers";

const SETUP: Record<string, string[]> = {
  cursor: [
    "Keep the Techlio connector running on this computer.",
    "The connector connects Cursor automatically if it is installed. Restart Cursor if it was already open.",
  ],
  claude_code: [
    "Keep the Techlio connector running.",
    "Point Claude Code hooks at http://127.0.0.1:9477/hooks/claude",
  ],
  vscode: [
    "Keep the Techlio connector running on this computer.",
    "The connector connects VS Code automatically if it is installed. Restart VS Code if it was already open.",
  ],
  gemini: [
    "Gemini activation is unavailable until its normalized event adapter is implemented.",
  ],
  codex: [
    "Codex activation is unavailable until its normalized event adapter is implemented.",
  ],
};

export function ActivateConnectorForm({
  displayName,
  onActivated,
}: {
  displayName?: string;
  onActivated?: () => void;
}) {
  const { token } = useAuth();
  const [deviceId, setDeviceId] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setOk(false);
    const res = await claimLocalConnector({
      accessToken: token,
      deviceId: deviceId.trim(),
      deviceToken: deviceToken.trim(),
      displayName,
      consentAccepted,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOk(true);
    setDeviceId("");
    setDeviceToken("");
    setConsentAccepted(false);
    onActivated?.();
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <label className="block">
        <span className="label mb-1 block">Device ID</span>
        <input
          className="field font-mono text-xs"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          placeholder="Assigned by your administrator"
          required
          autoComplete="off"
        />
      </label>
      <label className="block">
        <span className="label mb-1 block">Connector token</span>
        <PasswordField
          className="font-mono text-xs"
          value={deviceToken}
          onChange={(e) => setDeviceToken(e.target.value)}
          placeholder="Shown once when the admin issued the key"
          required
          autoComplete="off"
        />
      </label>
      <p className="hint">
        You can only activate a key your administrator assigned to you. You cannot create new
        connectors or pick extra AI tools here.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={consentAccepted}
          onChange={(e) => setConsentAccepted(e.target.checked)}
          required
        />
        <span>
          I reviewed the{" "}
          <Link href="/policy" className="text-[var(--accent)] underline">
            collection notice
          </Link>
          , including collected metadata, exclusions, retention, pause behavior, and dispute
          process.
        </span>
      </label>
      <button
        type="submit"
        className="btn-primary w-full"
        disabled={busy || !token || !consentAccepted}
      >
        {busy ? "Activating…" : "Activate on this computer"}
      </button>
      {error ? <Callout tone="bad" title={error} /> : null}
      {ok ? (
        <Callout tone="info" title="This computer is now using your assigned key">
          Activity from this machine is attributed to you. Keep the local connector running.
        </Callout>
      ) : null}
    </form>
  );
}

export function connectorSetupSteps(provider: string | null | undefined): string[] {
  if (!provider) return SETUP.cursor;
  return SETUP[provider] ?? [
    `Keep the Techlio connector running for ${providerLabel(provider)}.`,
  ];
}
