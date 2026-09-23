"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { ConnectorInstallGuide } from "@/components/domain/ConnectorInstallGuide";
import { Callout } from "@/components/ui/Callout";
import { useAuth } from "@/lib/auth-context";
import { useConnectorSetupPhase } from "@/lib/connector-local";

/** One banner that names the single next step, driven by the local connector. */
function NextStepBanner() {
  const { phase } = useConnectorSetupPhase(4_000);
  if (phase === "loading") return null;
  if (phase === "unpaired") {
    return (
      <Callout
        tone="warn"
        title="Connector installed and running — activate your key"
        action={
          <Link href="/my-connectors" className="btn-primary inline-flex h-9 items-center px-3 text-xs">
            Activate on My connectors
          </Link>
        }
      >
        The background connector is running on this computer but is not using your key yet, so
        nothing is reported. Open <strong>My connectors</strong>, paste the device ID and token
        your administrator gave you, accept the collection notice, and activate.
      </Callout>
    );
  }
  if (phase === "ready") {
    return (
      <Callout tone="info" title="This computer is set up">
        The connector is running with your key. Opening the dashboard…
      </Callout>
    );
  }
  return (
    <Callout tone="warn" title="Install the agent on this computer">
      Download the connector below and install it once, then activate your key on{" "}
      <strong>My connectors</strong>. You do not need the project repository.
    </Callout>
  );
}

export default function SetupConnectorPage() {
  const { user } = useAuth();

  if (user && user.role !== "developer") {
    return (
      <AppShell title="Connector setup">
        <Callout tone="info" title="For developers on their own computers">
          Administrators and managers issue keys on{" "}
          <Link href="/users" className="font-medium underline">Access</Link>. Send developers this
          page and the dashboard login link so they can install the local agent and activate their
          key.
        </Callout>
        <div className="mt-5">
          <ConnectorInstallGuide />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Required setup"
      subtitle="You must finish this on this computer before the dashboard is available"
    >
      <div className="mb-5 space-y-4" data-onboarding="onboard-welcome">
        <OnboardingStepper />
        <NextStepBanner />
        <ConnectorInstallGuide />
      </div>
      <Callout tone="info" title="Privacy">
        The agent records metadata about AI tool usage assigned to your key — not full prompts or
        keystrokes. You can pause collection from My connectors.
      </Callout>
    </AppShell>
  );
}
