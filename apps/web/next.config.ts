import {
  loadEnvironment,
  readWebConfiguration,
  readWebGatewayConfiguration,
} from "@airmech/config/server";
import type { NextConfig } from "next";

const environment = loadEnvironment();
const publicConfiguration = readWebConfiguration(environment);
const gateway = readWebGatewayConfiguration(environment);
// Publish only this validated public value for Next.js's build-time inlining.
process.env.NEXT_PUBLIC_APP_NAME = publicConfiguration.appName;

const nextConfig: NextConfig = {
  transpilePackages: ["@airmech/ui"],
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${gateway.apiUrl}/:path*` }];
  },
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
      {
        source: "/auth/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
