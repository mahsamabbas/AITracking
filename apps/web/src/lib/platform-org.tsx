"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setApiOrgContext } from "./api";

export type PlatformOrgState = {
  orgId: string;
  orgName: string | null;
  setOrgName: (name: string) => void;
  basePath: string;
  path: (segment: string) => string;
};

const PlatformOrgContext = createContext<PlatformOrgState | null>(null);

export function PlatformOrgProvider({
  orgId,
  children,
}: {
  orgId: string;
  children: ReactNode;
}) {
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    setApiOrgContext(orgId);
    return () => setApiOrgContext(null);
  }, [orgId]);

  const value = useMemo<PlatformOrgState>(() => {
    const basePath = `/platform/${orgId}`;
    return {
      orgId,
      orgName,
      setOrgName,
      basePath,
      path: (segment: string) => {
        const clean = segment.startsWith("/") ? segment : `/${segment}`;
        if (clean === "/" || clean === "/overview") return `${basePath}/overview`;
        return `${basePath}${clean}`;
      },
    };
  }, [orgId, orgName]);

  return <PlatformOrgContext.Provider value={value}>{children}</PlatformOrgContext.Provider>;
}

export function usePlatformOrg(): PlatformOrgState {
  const ctx = useContext(PlatformOrgContext);
  if (!ctx) throw new Error("usePlatformOrg requires PlatformOrgProvider");
  return ctx;
}

export function usePlatformOrgOptional(): PlatformOrgState | null {
  return useContext(PlatformOrgContext);
}
