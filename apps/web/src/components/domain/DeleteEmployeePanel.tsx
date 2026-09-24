"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function DeleteEmployeePanel({
  employeeId,
  displayName,
}: {
  employeeId: string;
  displayName: string;
}) {
  const { token } = useAuth();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phrase = displayName.trim() || "DELETE";
  const ready = confirm.trim() === phrase;

  async function onDelete() {
    if (!token || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await apiDelete<{ ok: boolean }>(`/v1/employees/${employeeId}`, token);
      router.push("/employees");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this employee");
      setBusy(false);
    }
  }

  return (
    <Card className="border-rose-200 dark:border-rose-900/50">
      <CardHeader
        title="Remove employee"
        subtitle="Permanently deletes this person, their portal login, connectors, and all AI usage data for your organisation"
      />
      <CardBody className="space-y-4">
        <p className="text-sm text-ink-600">
          This removes activity events, agent sessions, hourly summaries, registered devices, provider
          identity mappings, and any portal account linked to this employee. It cannot be undone.
        </p>
        <label className="block max-w-md">
          <span className="label mb-1 block">
            Type <span className="font-semibold text-ink-900">{phrase}</span> to confirm
          </span>
          <input
            className="field"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            placeholder={phrase}
          />
        </label>
        {error ? <Callout tone="bad" title={error} /> : null}
        <button type="button" className="btn-ghost border-rose-300 text-rose-700" disabled={!ready || busy} onClick={() => void onDelete()}>
          {busy ? "Removing…" : "Delete employee and all data"}
        </button>
      </CardBody>
    </Card>
  );
}
