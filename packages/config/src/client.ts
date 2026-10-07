import { ConfigurationError, type EnvironmentInput, readText } from "./validation";

export interface ClientConfiguration {
  readonly appName: string;
}

// Vercel injects these public deployment metadata keys for Next.js builds.
// They are optional and unused by the app; do not parse Git refs/messages as app settings.
// Keep an exact allowlist so prefixed secrets and unknown public settings still fail.
// https://vercel.com/docs/environment-variables/framework-environment-variables
const vercelMetadataSettings = new Set([
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_TARGET_ENV",
  "NEXT_PUBLIC_VERCEL_URL",
  "NEXT_PUBLIC_VERCEL_BRANCH_URL",
  "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL",
  "NEXT_PUBLIC_VERCEL_HASH_SALT",
  "NEXT_PUBLIC_VERCEL_GIT_PROVIDER",
  "NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG",
  "NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER",
  "NEXT_PUBLIC_VERCEL_GIT_REPO_ID",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_MESSAGE",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_LOGIN",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_NAME",
  "NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID",
]);

export function readClientConfiguration(environment: EnvironmentInput): ClientConfiguration {
  for (const setting of Object.keys(environment)) {
    if (
      setting.startsWith("NEXT_PUBLIC_") &&
      setting !== "NEXT_PUBLIC_APP_NAME" &&
      !vercelMetadataSettings.has(setting)
    ) {
      throw new ConfigurationError(setting);
    }
  }
  const appName = readText(environment, "NEXT_PUBLIC_APP_NAME", 80) ?? "Airmech One";
  return Object.freeze({ appName });
}
