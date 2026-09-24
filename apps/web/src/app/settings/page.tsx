"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { LoadingBlock } from "@/components/ui/States";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { useAuth } from "@/lib/auth-context";
import { apiPatch } from "@/lib/api";
import {
  biometricLabel,
  canUsePlatformBiometrics,
  clearEnrollment,
  dismissBiometricPrompt,
  enrollPlatformBiometrics,
  isMobileDevice,
  loadEnrollment,
} from "@/lib/biometric";
import { readAvatarFile, readLogoFile } from "@/lib/image-upload";
import { useApi } from "@/lib/use-api";
import { usePlatformOrgOptional } from "@/lib/platform-org";
import { ROLE_LABEL } from "@/lib/permissions";
import Link from "next/link";

type TabId = "profile" | "security" | "organization";

export default function SettingsPage() {
  const { user, token, applySession } = useAuth();
  const platformOrg = usePlatformOrgOptional();
  const [tab, setTab] = useState<TabId>("profile");

  const branding = useApi<{ organization: { id: string; name: string; logoUrl: string | null } }>(
    user?.role === "super_admin" && !platformOrg ? null : "/v1/org/branding",
  );

  const tabs = useMemo(() => {
    const items: { id: TabId; label: string }[] = [
      { id: "profile", label: "Profile" },
      { id: "security", label: "Security" },
    ];
    if (user?.role === "administrator" || user?.role === "super_admin" || platformOrg) {
      items.push({ id: "organization", label: "Organisation" });
    }
    return items;
  }, [user?.role, platformOrg]);

  return (
    <AppShell title="Settings" subtitle="Your account, sign-in options, and organisation appearance">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === "profile" && user ? (
          <ProfileTab user={user} token={token} applySession={applySession} />
        ) : null}
        {tab === "security" && user ? <SecurityTab user={user} token={token} /> : null}
        {tab === "organization" ? (
          <OrganizationTab
            userRole={user?.role}
            platformOrg={platformOrg}
            branding={branding.data?.organization ?? null}
            brandingLoading={branding.loading}
            token={token}
            onSaved={() => branding.reload()}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function ProfileTab({
  user,
  token,
  applySession,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  token: string | null;
  applySession: (token: string, user: typeof user) => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatarUrl ?? null);
  const [avatarPayload, setAvatarPayload] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(user.displayName);
    setEmail(user.email);
    setAvatarPreview(user.avatarUrl ?? null);
  }, [user.displayName, user.email, user.avatarUrl]);

  async function onPickAvatar(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readAvatarFile(file);
      setAvatarPreview(dataUrl);
      setAvatarPayload(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that image");
    }
  }

  async function save() {
    if (!token) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: { displayName?: string; email?: string; avatarUrl?: string | null } = {};
      if (displayName.trim() !== user.displayName) body.displayName = displayName.trim();
      if (email.trim().toLowerCase() !== user.email) body.email = email.trim();
      if (avatarPayload !== undefined) body.avatarUrl = avatarPayload;
      if (Object.keys(body).length === 0) {
        setMessage("Nothing to save.");
        return;
      }
      const res = await apiPatch<{ user: typeof user; token: string }>("/v1/me", token, body);
      applySession(res.token, res.user);
      setAvatarPayload(undefined);
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Profile" subtitle="Name, email, and photo shown in the portal" />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar name={displayName || user.displayName} src={avatarPreview} size="lg" />
          <div>
            <p className="text-sm font-medium text-ink-900">{ROLE_LABEL[user.role]}</p>
            <label className="btn-ghost mt-2 inline-flex h-9 cursor-pointer items-center px-3 text-xs">
              Change photo
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
              />
            </label>
            {avatarPreview ? (
              <button
                type="button"
                className="btn-quiet ml-2 h-9 text-xs"
                onClick={() => {
                  setAvatarPreview(null);
                  setAvatarPayload(null);
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label mb-1 block">Display name</span>
            <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="block">
            <span className="label mb-1 block">Email</span>
            <input
              className="field"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
        <label className="block max-w-md">
          <span className="label mb-1 block">Display timezone</span>
          <TimezoneSelect />
          <p className="mt-1 text-2xs text-ink-500">Used for charts and timestamps across the dashboard.</p>
        </label>
        {error ? <Callout tone="bad" title={error} /> : null}
        {message ? <Callout tone="info" title={message} /> : null}
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </CardBody>
    </Card>
  );
}

function SecurityTab({
  user,
  token,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  token: string | null;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [bioAvailable, setBioAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const label = biometricLabel();

  useEffect(() => {
    setEnrolled(Boolean(loadEnrollment()));
    void canUsePlatformBiometrics().then(setBioAvailable);
  }, []);

  async function changePassword() {
    if (!token) return;
    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiPatch("/v1/me/password", token, { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setMessage("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  }

  async function enableBiometric() {
    setBioBusy(true);
    setError(null);
    try {
      await enrollPlatformBiometrics(user);
      dismissBiometricPrompt();
      setEnrolled(true);
      setMessage(`${label} is enabled on this device.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not enable ${label}`);
    } finally {
      setBioBusy(false);
    }
  }

  function disableBiometric() {
    clearEnrollment();
    setEnrolled(false);
    setMessage(`${label} removed from this device.`);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Password" subtitle="Sign in with email and password on every device" />
        <CardBody className="grid gap-4 sm:max-w-md">
          <label className="block">
            <span className="label mb-1 block">Current password</span>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label mb-1 block">New password</span>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label mb-1 block">Confirm new password</span>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button type="button" className="btn-primary sm:w-fit" disabled={busy} onClick={() => void changePassword()}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </CardBody>
      </Card>

      {isMobileDevice() ? (
        <Card>
          <CardHeader
            title={label}
            subtitle="Unlock the portal on this phone without typing your password again"
          />
          <CardBody className="space-y-3">
            {!bioAvailable ? (
              <p className="text-sm text-ink-500">
                {label} is not available in this browser. Use Safari on iPhone or Chrome on Android.
              </p>
            ) : enrolled ? (
              <>
                <Callout tone="info" title={`${label} is enabled for ${user.email} on this device.`} />
                <button type="button" className="btn-ghost h-9 text-sm" disabled={bioBusy} onClick={disableBiometric}>
                  Turn off {label}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-500">
                  After you enable {label}, signing out will ask for {label} instead of your password on this device
                  only.
                </p>
                <button type="button" className="btn-primary sm:w-fit" disabled={bioBusy} onClick={() => void enableBiometric()}>
                  {bioBusy ? "Waiting…" : `Enable ${label}`}
                </button>
              </>
            )}
          </CardBody>
        </Card>
      ) : (
        <Callout tone="info" title="Face ID and fingerprint">
          Open Techlio on your phone to enable biometric unlock — it is managed per device in Settings → Security.
        </Callout>
      )}

      {error ? <Callout tone="bad" title={error} /> : null}
      {message ? <Callout tone="info" title={message} /> : null}
    </div>
  );
}

function OrganizationTab({
  userRole,
  platformOrg,
  branding,
  brandingLoading,
  token,
  onSaved,
}: {
  userRole?: string;
  platformOrg: ReturnType<typeof usePlatformOrgOptional>;
  branding: { id: string; name: string; logoUrl: string | null } | null;
  brandingLoading: boolean;
  token: string | null;
  onSaved: () => void;
}) {
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLogoPreview(branding?.logoUrl ?? null);
  }, [branding?.logoUrl]);

  if (userRole === "super_admin" && !platformOrg) {
    return (
      <Card>
        <CardHeader title="Organisation logo" subtitle="Set a logo for each customer organisation" />
        <CardBody className="space-y-3">
          <p className="text-sm text-ink-500">
            From the{" "}
            <Link href="/platform" className="font-medium text-brand-700 underline-offset-2 hover:underline">
              Platform
            </Link>{" "}
            console you can upload a logo for any organisation, or open a tenant workspace and return here to manage
            branding while inspecting that org.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (brandingLoading && !branding) return <LoadingBlock rows={4} />;

  async function onPickLogo(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readLogoFile(file);
      setLogoPreview(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that image");
    }
  }

  async function saveLogo(payload: string | null) {
    if (!token) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiPatch("/v1/org/branding", token, { logoUrl: payload });
      setMessage("Organisation logo updated.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save logo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Organisation logo"
        subtitle={branding ? `Shown in the portal for ${branding.name}` : "Your organisation"}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="" className="h-16 max-w-[200px] rounded-lg object-contain ring-1 ring-line" />
          ) : (
            <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed border-line text-2xs text-ink-400">
              No logo
            </div>
          )}
          <label className="btn-ghost inline-flex h-9 cursor-pointer items-center px-3 text-xs">
            Upload logo
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onPickLogo(e.target.files?.[0] ?? null)} />
          </label>
          {logoPreview ? (
            <button type="button" className="btn-quiet h-9 text-xs" onClick={() => setLogoPreview(null)}>
              Clear preview
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !logoPreview}
            onClick={() => void saveLogo(logoPreview)}
          >
            {busy ? "Saving…" : "Save logo"}
          </button>
          {branding?.logoUrl ? (
            <button type="button" className="btn-ghost h-9" disabled={busy} onClick={() => void saveLogo(null)}>
              Remove logo
            </button>
          ) : null}
        </div>
        {error ? <Callout tone="bad" title={error} /> : null}
        {message ? <Callout tone="info" title={message} /> : null}
      </CardBody>
    </Card>
  );
}
