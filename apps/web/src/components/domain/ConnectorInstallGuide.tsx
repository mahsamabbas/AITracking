"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  CONNECTOR_MAC_PKG,
  CONNECTOR_WINDOWS_EXE,
  detectConnectorPlatform,
  useConnectorOnline,
  useConnectorSetupPhase,
} from "@/lib/connector-local";
import { LocalAccessHint } from "@/components/domain/LocalAccessHint";

function StepBadge({ done, n }: { done: boolean; n: number }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        done
          ? "bg-emerald-600 text-white"
          : "border border-line bg-slate-100 text-ink-700 dark:bg-slate-800 dark:text-ink-700"
      }`}
      aria-hidden
    >
      {done ? "✓" : n}
    </span>
  );
}

export function ConnectorInstallGuide() {
  const { online, refresh } = useConnectorOnline(5_000);
  const { phase } = useConnectorSetupPhase(4_000);
  const platform = detectConnectorPlatform();
  const macHref = CONNECTOR_MAC_PKG;
  const macLabel = "Download for Mac";
  const step1Done = phase === "unpaired" || phase === "ready";
  const step3Done = phase === "ready";

  const steps = (
    <ol className="space-y-4">
      <li className="flex gap-3" data-onboarding="onboard-install">
        <StepBadge done={step1Done} n={1} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">Install the background connector</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-700">
            You do not need the Techlio project. The connector installs as a background service:
            there is no app window to keep open, it starts automatically when you sign in, and it
            reports what AI agents such as Claude Code, Cursor, and Antigravity do on this machine.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a
              href={platform === "windows" ? CONNECTOR_WINDOWS_EXE : macHref}
              download
              className="btn-primary inline-flex h-9 items-center whitespace-nowrap px-3 text-xs"
            >
              {platform === "windows" ? "Download for Windows" : macLabel}
            </a>
            <button type="button" className="btn-ghost h-9 whitespace-nowrap text-xs" onClick={() => void refresh()}>
              Check if running
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-700">
            {platform === "windows"
              ? "Open the downloaded file once. If Windows warns you, choose More info, then Run anyway. It installs itself in the background and shows a confirmation — no window stays open. It appears in Settings → Apps if you ever need to remove it. Then click Check if running."
              : "Open the downloaded installer and follow the steps (macOS asks for your password once). Nothing is added to Applications or the Dock; the connector runs in the background for Intel and Apple silicon. Then click Check if running."}
          </p>
          {online === false ? (
            <>
              <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                Not detected on this computer yet — complete the install, then click “Check if running”.
              </p>
              <LocalAccessHint />
            </>
          ) : null}
          {online === true ? (
            <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Local agent is running.
            </p>
          ) : null}
        </div>
      </li>

      <li className="flex gap-3" data-onboarding="onboard-key">
        <StepBadge done={false} n={2} />
        <div>
          <p className="text-sm font-semibold text-ink-900">Get your connector key from your administrator</p>
          <p className="mt-1 text-xs text-ink-700">
            They create a <strong className="text-ink-900">device ID</strong> and{" "}
            <strong className="text-ink-900">token</strong> for you on Access / Connectors. You cannot
            make your own key.
          </p>
        </div>
      </li>

      <li className="flex gap-3">
        <StepBadge done={step3Done} n={3} />
        <div>
          <p className="text-sm font-semibold text-ink-900">Activate on this computer</p>
          <p className="mt-1 text-xs text-ink-700">
            Open{" "}
            <Link
              href="/my-connectors"
              className="font-medium text-brand-700 underline dark:text-brand-400"
            >
              My connectors
            </Link>
            , paste your key, accept consent, and activate. Activity then uploads to your organisation’s
            dashboard.
          </p>
          {step1Done && !step3Done ? (
            <Link href="/my-connectors" className="btn-primary mt-3 inline-flex h-9 text-xs">
              Go to My connectors — required
            </Link>
          ) : null}
          {step3Done ? (
            <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Setup complete — the dashboard will open automatically.
            </p>
          ) : null}
        </div>
      </li>
    </ol>
  );

  return (
    <Card>
      <CardHeader
        title="Set up this computer"
        subtitle="Follow these steps once per machine. Sharing the dashboard link alone does not install the agent on someone else’s PC."
      />
      <CardBody>{steps}</CardBody>
    </Card>
  );
}
