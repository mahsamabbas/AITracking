"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Callout } from "@/components/ui/Callout";
import { PasswordField } from "@/components/ui/PasswordField";
import { Button } from "@/components/ui/Button";
import { claimLocalConnector } from "@/components/domain/ConnectThisComputer";
import { FIELD_LIMITS } from "@/lib/validation";

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
          maxLength={FIELD_LIMITS.deviceId}
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
          maxLength={FIELD_LIMITS.connectorToken}
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
      <Button type="submit" className="w-full" loading={busy} loadingLabel="Activating…" disabled={!token || !consentAccepted}>
        Activate on this computer
      </Button>
      {error ? <Callout tone="bad" title={error} /> : null}
      {ok ? (
        <Callout tone="info" title="This computer is now using your assigned key">
          Activity from this machine is attributed to you. Keep the local connector running.
        </Callout>
      ) : null}
    </form>
  );
}
