import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets CI or a second checkout build without touching a dev server's .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        // The service worker must always be revalidated so updates reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
