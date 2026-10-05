import { defineConfig } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const baseURL = process.env.AIRMECH_BROWSER_BASE_URL;
if (!baseURL) {
  throw new Error("Run browser tests with pnpm test:browser to start an owned local server.");
}
const endpoint = new URL(baseURL);
if (
  endpoint.protocol !== "http:" ||
  endpoint.hostname !== "127.0.0.1" ||
  !endpoint.port ||
  endpoint.username ||
  endpoint.password ||
  endpoint.pathname !== "/" ||
  endpoint.search ||
  endpoint.hash
) {
  throw new Error("The browser-test runner must supply a loopback HTTP endpoint with a port.");
}

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: true,
  workers: 2,
  globalTimeout: 120000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
