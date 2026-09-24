import type { Metadata } from "next";
import "./globals.css";
import { ConnectorOnboardingTour } from "@/components/onboarding/ConnectorOnboardingTour";
import { ConnectorRequiredGate } from "@/components/domain/ConnectorRequiredGate";
import { AuthProvider } from "@/lib/auth-context";
import { DisplayTimezoneProvider } from "@/lib/display-timezone";
import { ThemeProvider } from "@/lib/theme";
import { BRAND } from "@/lib/brand";
import { PwaProvider } from "@/lib/pwa";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  applicationName: BRAND.name,
  description: BRAND.description,
  // Installed on iPhone/iPad: full-screen app with its own name and icon.
  appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/logo.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "any" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  // Android: the on-screen keyboard resizes content instead of covering inputs.
  interactiveWidget: "resizes-content" as const,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e13" },
  ],
};

const THEME_BOOT = `(function(){try{var t=localStorage.getItem("techlio-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <PwaProvider>
          <AuthProvider>
            <DisplayTimezoneProvider>
              <ConnectorRequiredGate>{children}</ConnectorRequiredGate>
              <ConnectorOnboardingTour />
            </DisplayTimezoneProvider>
          </AuthProvider>
          </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
