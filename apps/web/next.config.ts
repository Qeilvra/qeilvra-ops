import { loadEnvironment, readWebConfiguration } from "@airmech/config/server";
import type { NextConfig } from "next";

const publicConfiguration = readWebConfiguration(loadEnvironment());
// Publish only this validated public value for Next.js's build-time inlining.
process.env.NEXT_PUBLIC_APP_NAME = publicConfiguration.appName;

const nextConfig: NextConfig = {
  transpilePackages: ["@airmech/ui"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
