import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { clientConfiguration } from "@/config/client";

import "@airmech/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: `${clientConfiguration.appName} | Built by Qeilvra`,
  description: "Operations Management System for Airmech Oman. Built by Qeilvra.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B2230",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
