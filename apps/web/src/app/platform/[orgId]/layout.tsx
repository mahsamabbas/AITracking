"use client";

import { PlatformOrgMetaLoader, PlatformOrgTabBar } from "@/components/PlatformOrgTabBar";
import { PlatformOrgProvider } from "@/lib/platform-org";

export default function PlatformOrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { orgId: string };
}) {
  return (
    <PlatformOrgProvider orgId={params.orgId}>
      <PlatformOrgMetaLoader />
      {children}
    </PlatformOrgProvider>
  );
}
