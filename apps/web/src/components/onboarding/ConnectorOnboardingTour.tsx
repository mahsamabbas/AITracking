"use client";

import { TourSpotlight, type TourStep } from "@/components/onboarding/TourSpotlight";
import { useConnectorSetupPhase } from "@/lib/connector-local";
import { developerNeedsLocalConnector } from "@/lib/connector-setup";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STEPS: TourStep[] = [
  {
    id: "welcome",
    selector: '[data-onboarding="onboard-welcome"]',
    title: "Welcome — set up this computer",
    body:
      "Before you can use Techlio, install a small local agent on this Mac or PC. We’ll walk you through it in a few steps.",
    placement: "bottom",
    paths: ["/setup-connector"],
  },
  {
    id: "install",
    selector: '[data-onboarding="onboard-install"]',
    title: "Install the local agent",
    body:
      "Download the connector for this computer and open it. You do not need the project, Node.js, or pnpm. Then come back and click Check if running.",
    placement: "right",
    paths: ["/setup-connector"],
  },
  {
    id: "key",
    selector: '[data-onboarding="onboard-key"]',
    title: "Get your connector key",
    body:
      "Your administrator sends you a device ID and token (from Access). You cannot create keys yourself.",
    placement: "right",
    paths: ["/setup-connector"],
  },
  {
    id: "nav",
    selector: '[data-onboarding="onboard-nav-connectors"]',
    title: "Open My connectors",
    body: "Use the sidebar to open My connectors — that’s where you paste your key.",
    placement: "right",
    cta: { label: "Go to My connectors", href: "/my-connectors" },
  },
  {
    id: "activate",
    selector: '[data-onboarding="onboard-activate-form"]',
    title: "Activate your key",
    body:
      "Paste the device ID and token, accept consent, and activate. When pairing succeeds, the full dashboard unlocks.",
    placement: "left",
    paths: ["/my-connectors"],
  },
];

const STORAGE_KEY = "techlio-connector-tour-step";

export function ConnectorOnboardingTour() {
  const { token, user, ready, locked } = useAuth();
  const pathname = usePathname();
  const { phase } = useConnectorSetupPhase(
    4_000,
    Boolean(ready && token && !locked && developerNeedsLocalConnector(user?.role, user?.developerId)),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(true);

  const show = Boolean(
    ready &&
      token &&
      !locked &&
      !dismissed &&
      developerNeedsLocalConnector(user?.role, user?.developerId) &&
      phase !== "ready" &&
      pathname !== "/login",
  );

  useEffect(() => {
    if (!show) return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setStepIndex(Number(saved) || 0);
    } catch {
      /* ignore */
    }
  }, [show]);

  useEffect(() => {
    if (!show) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, String(stepIndex));
    } catch {
      /* ignore */
    }
  }, [stepIndex, show]);

  useEffect(() => {
    const restart = () => {
      setDismissed(false);
      setStepIndex(0);
    };
    window.addEventListener("techlio:start-tour", restart);
    return () => window.removeEventListener("techlio:start-tour", restart);
  }, []);

  useEffect(() => {
    if (phase === "ready") {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [phase]);

  const steps = useMemo(() => STEPS, []);

  if (!show) return null;

  return (
    <TourSpotlight
      steps={steps}
      active={show}
      stepIndex={Math.min(stepIndex, steps.length - 1)}
      onStepIndexChange={setStepIndex}
      onDone={() => setDismissed(true)}
    />
  );
}
