import type { Metadata, Viewport } from "next";
import { Arimo } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

// Helvetica Neue (Apple devices) is the closest match to the site's Alte Haas Grotesk; Arimo covers Android/Windows.
const fallback = Arimo({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-fallback", display: "swap" });

export const metadata: Metadata = {
  title: { default: "beans&beats · christmas together", template: "%s · beans&beats" },
  description: "Order system for the beans&beats charity café at Christmas Together 2026, Singapore.",
  applicationName: "beans&beats",
  appleWebApp: { capable: true, title: "beans&beats", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fallback.variable}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
