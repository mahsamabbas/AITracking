const STORAGE_KEY = "techlio-biometric";
const DISMISSED_KEY = "techlio-biometric-dismissed";

export interface BiometricEnrollment {
  credentialId: string;
  userId: string;
  email: string;
  displayName: string;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Phones and tablets only — never desktop browsers, even with Touch ID. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod|Android.+Mobile/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  if (/Android/i.test(ua) && !/Mobile/i.test(ua) && navigator.maxTouchPoints > 0) {
    return true;
  }
  return false;
}

export function biometricLabel(): string {
  if (typeof navigator === "undefined") return "device biometrics";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "Face ID";
  }
  if (/Android/i.test(ua)) return "fingerprint";
  return "device biometrics";
}

export async function canUsePlatformBiometrics(): Promise<boolean> {
  if (typeof window === "undefined" || !isMobileDevice()) return false;
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function loadEnrollment(): BiometricEnrollment | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricEnrollment;
    if (!parsed.credentialId || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearEnrollment(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function dismissBiometricPrompt(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export async function enrollPlatformBiometrics(user: {
  id: string;
  email: string;
  displayName: string;
}): Promise<BiometricEnrollment> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Techlio", id: location.hostname },
      user: {
        id: new TextEncoder().encode(user.id),
        name: user.email,
        displayName: user.displayName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometric enrollment was cancelled");
  const enrollment: BiometricEnrollment = {
    credentialId: bytesToBase64(cred.rawId),
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(enrollment));
  localStorage.removeItem(DISMISSED_KEY);
  return enrollment;
}

export async function verifyPlatformBiometrics(): Promise<void> {
  const enrollment = loadEnrollment();
  if (!enrollment) throw new Error("No biometric login is set up on this device");
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [
        {
          type: "public-key",
          id: base64ToBytes(enrollment.credentialId),
        },
      ],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  if (!assertion) throw new Error("Biometric verification was cancelled");
}
