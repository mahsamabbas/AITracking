import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** Installable app (PWA) on Android, iOS, Windows, macOS, and ChromeOS. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#f6f7f9",
    theme_color: BRAND.themeColor,
    categories: ["productivity", "business", "developer"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Overview", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Employees", url: "/employees", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
