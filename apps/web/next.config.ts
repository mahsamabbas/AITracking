import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets CI or a second checkout build without touching a dev server's .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
