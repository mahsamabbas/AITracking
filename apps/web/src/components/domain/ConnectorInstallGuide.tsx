"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  CONNECTOR_LINUX_ARM64,
  CONNECTOR_LINUX_X64,
  CONNECTOR_MAC_PKG,
  CONNECTOR_WINDOWS_EXE,
  detectConnectorPlatform,
  linuxInstallCommand,
  type ConnectorPlatform,
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
  const { phase, installedHere } = useConnectorSetupPhase(4_000);
  const [checking, setChecking] = useState(false);
  // Detected from the browser; the person can switch (e.g. downloading for another computer).
  const detected = detectConnectorPlatform();
  const [platform, setPlatform] = useState<Exclude<ConnectorPlatform, "other">>(
    detected === "other" ? "mac" : detected,
  );
  const [copied, setCopied] = useState(false);
  // Installed means a connector answers on this computer, not just a recent heartbeat.
  const step1Done = installedHere !== false && (phase === "unpaired" || phase === "ready");
  const step3Done = installedHere !== false && phase === "ready";

  const steps = (
    <ol className="space-y-4">
      <li className="flex gap-3" data-onboarding="onboard-install">
        <StepBadge done={step1Done} n={1} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">Install the background connector</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-700">
            You do not need the Techlio project. The connector installs as a background service:
            there is no app window to keep open, it starts automatically when you sign in, and it
            reports what AI agents such as Claude Code, Cursor, GitHub Copilot, Windsurf, Antigravity,
            Gemini CLI, Codex CLI, and Devin CLI do on this machine.
          </p>
          <div className="mt-3 seg" role="radiogroup" aria-label="Operating system">
            {(
              [
                ["mac", "macOS"],
                ["windows", "Windows"],
                ["linux", "Linux"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={platform === id}
                className={platform === id ? "seg-item-on" : "seg-item"}
                onClick={() => setPlatform(id)}
              >
                {label}
                {detected === id ? " (this computer)" : ""}
              </button>
            ))}
          </div>
          {platform === "linux" ? (
            <div className="mt-3">
              <p className="text-xs text-ink-700">Open a terminal and run:</p>
              <div className="mt-1.5 flex items-start gap-2">
                <code className="code-snippet mt-0 flex-1 select-all">{linuxInstallCommand()}</code>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 shrink-0 text-xs"
                  onClick={() => {
                    void navigator.clipboard?.writeText(linuxInstallCommand()).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2_000);
                    });
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {platform === "linux" ? (
              <>
                <a href={CONNECTOR_LINUX_X64} download className="btn-ghost inline-flex h-9 items-center whitespace-nowrap px-3 text-xs">
                  Download .tar.gz (x86_64)
                </a>
                <a href={CONNECTOR_LINUX_ARM64} download className="btn-ghost inline-flex h-9 items-center whitespace-nowrap px-3 text-xs">
                  Download .tar.gz (arm64)
                </a>
              </>
            ) : (
              <a
                href={platform === "windows" ? CONNECTOR_WINDOWS_EXE : CONNECTOR_MAC_PKG}
                download
                className="btn-primary inline-flex h-9 items-center whitespace-nowrap px-3 text-xs"
              >
                {platform === "windows" ? "Download for Windows" : "Download for Mac"}
              </a>
            )}
            <Button
              type="button"
              variant="ghost"
              className="h-9 whitespace-nowrap text-xs"
              loading={checking}
              loadingLabel="Checking…"
              onClick={() => {
                setChecking(true);
                void refresh().finally(() => setChecking(false));
              }}
            >
              Check if running
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-700">
            {platform === "windows"
              ? "Open the downloaded file once. If Windows warns you, choose More info, then Run anyway. It installs itself in the background and shows a confirmation — no window stays open. It appears in Settings → Apps if you ever need to remove it. Then click Check if running."
              : platform === "linux"
                ? "The command installs for your user only (no sudo) on Ubuntu, Debian, Fedora, Arch and WSL: it checks the download, then starts the connector as a background service that also starts when you sign in. To install from a downloaded archive instead, extract it and run ./techlio-connector once. Then click Check if running."
                : "Open the downloaded installer and follow the steps (macOS asks for your password once). Nothing is added to Applications or the Dock; the connector runs in the background for Intel and Apple silicon. Then click Check if running."}
          </p>
          {/* Says why it is not reachable (browser permission, other address, not installed). */}
          {online === false && (phase !== "ready" || installedHere === false) ? <LocalAccessHint onReachable={() => void refresh()} /> : null}
          {online === true || phase === "ready" ? (
            <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              {online === true ? "Connector is running on this computer." : "Your connector is running and reporting activity."}
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
