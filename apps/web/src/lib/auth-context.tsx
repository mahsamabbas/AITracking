"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_BASE } from "./api";
import { setConnectorViewer } from "./connector-local";
import {
  isMobileDevice,
  loadEnrollment,
  verifyPlatformBiometrics,
} from "./biometric";
import { homePathForRole } from "./permissions";
import type { Role } from "./types";

const TOKEN_KEY = "techlio-jwt";
const PUBLIC_PATHS = ["/login"];

export interface PortalUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string;
  developerId?: string | null;
  avatarUrl?: string | null;
  employee?: {
    team: string | null;
    title: string | null;
    status: string;
    joinedAt: string | null;
  } | null;
}

interface AuthState {
  token: string | null;
  user: PortalUser | null;
  ready: boolean;
  locked: boolean;
  login: (email: string, password: string) => Promise<void>;
  unlockWithBiometric: () => Promise<void>;
  logout: () => void;
  applySession: (token: string, user: PortalUser) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  ready: false,
  locked: false,
  login: async () => {},
  unlockWithBiometric: async () => {},
  logout: () => {},
  applySession: () => {},
  refreshUser: async () => {},
});

async function fetchCurrentUser(stored: string): Promise<PortalUser> {
  const r = await fetch(`${API_BASE}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${stored}` },
  });
  if (!r.ok) throw new Error("expired");
  const json = await r.json();
  return json.user as PortalUser;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setLocked(false);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode */
    }
    router.push("/login");
  }, [router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await fetch(`${API_BASE}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.message ?? "Sign-in failed");
      setToken(json.token);
      setUser(json.user);
      setConnectorViewer(json.user.developerId);
      try {
        localStorage.setItem(TOKEN_KEY, json.token);
      } catch {
        /* private mode */
      }
      setLocked(false);
      const role = json.user.role as PortalUser["role"];
      const devId = json.user.developerId as string | null | undefined;
      const destination = json.homePath ?? homePathForRole(role, devId);
      router.push(destination);
    },
    [router],
  );

  const unlockWithBiometric = useCallback(async () => {
    await verifyPlatformBiometrics();
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch {
      stored = null;
    }
    if (!stored) {
      throw new Error(
        "Sign in with your password once on this phone, then enable biometric unlock.",
      );
    }
    const nextUser = await fetchCurrentUser(stored);
    setConnectorViewer(nextUser.developerId);
    setToken(stored);
    setUser(nextUser);
    setLocked(false);
    router.push(homePathForRole(nextUser.role, nextUser.developerId));
  }, [router]);

  const applySession = useCallback((nextToken: string, nextUser: PortalUser) => {
    setConnectorViewer(nextUser.developerId);
    setToken(nextToken);
    setUser(nextUser);
    try {
      localStorage.setItem(TOKEN_KEY, nextToken);
    } catch {
      /* private mode */
    }
  }, []);

  const refreshUser = useCallback(async () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch {
      stored = null;
    }
    if (!stored) return;
    const nextUser = await fetchCurrentUser(stored);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch {
      stored = null;
    }
    if (!stored) {
      setReady(true);
      return;
    }
    const requireBiometric = isMobileDevice() && Boolean(loadEnrollment());
    if (requireBiometric) {
      setLocked(true);
      setReady(true);
      return;
    }
    fetchCurrentUser(stored)
      .then((nextUser) => {
        setConnectorViewer(nextUser.developerId);
        setToken(stored);
        setUser(nextUser);
      })
      .catch(() => {
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch {
          /* ignore */
        }
      })
      .finally(() => setReady(true));
  }, []);

  // Local connector discovery must pick *this* person's connector on a
  // computer shared by several OS users (see lib/connector-local.ts).
  useEffect(() => {
    setConnectorViewer(user?.developerId);
  }, [user?.developerId]);

  useEffect(() => {
    if (!ready) return;
    const isPublic = PUBLIC_PATHS.includes(pathname);
    if ((!token || locked) && !isPublic) router.replace("/login");
    if (token && !locked && isPublic) {
      router.replace(homePathForRole(user?.role, user?.developerId));
    }
  }, [ready, token, locked, pathname, router, user?.role, user?.developerId]);

  const value = useMemo<AuthState>(
    () => ({ token, user, ready, locked, login, unlockWithBiometric, logout, applySession, refreshUser }),
    [token, user, ready, locked, login, unlockWithBiometric, logout, applySession, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
