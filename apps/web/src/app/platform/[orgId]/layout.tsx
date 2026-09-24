"use client";

import { useParams } from "next/navigation";
import { PlatformOrgMetaLoader } from "@/components/PlatformOrgTabBar";
import { PlatformOrgProvider } from "@/lib/platform-org";

export default function PlatformOrgLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const orgId = typeof params?.orgId === "string" ? params.orgId : "";

  if (!orgId) {
    return <>{children}</>;
  }

  return (
    <PlatformOrgProvider orgId={orgId}>
      <PlatformOrgMetaLoader />
      {children}
    </PlatformOrgProvider>
  );
}
