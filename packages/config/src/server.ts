import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import { type ClientConfiguration, readClientConfiguration } from "./client";
import { parseRuntimeSettings, readEnvironmentMode, type RuntimeSettings } from "./runtime";
import {
  ConfigurationError,
  type EnvironmentInput,
  includesControlCharacter,
  readFlag,
  readSecret,
  readText,
  readUrl,
  requireSetting,
} from "./validation";

export { ConfigurationError } from "./validation";
export { readEnvironmentMode } from "./runtime";

export interface EnvironmentLoadOptions {
  readonly environment?: EnvironmentInput;
  readonly envFile?: string | false;
}

interface UrlConfiguration {
  readonly enabled: boolean;
  readonly url: string | null;
}

export interface DatabaseConfiguration extends UrlConfiguration {
  readonly migrationUrl: string | null;
  readonly caFile: string | null;
}

export interface AuthConfiguration {
  readonly enabled: boolean;
  readonly secret: string | null;
  readonly appUrl: string | null;
  readonly sessionSeconds: number | null;
  readonly bootstrapEmail: string | null;
  readonly bootstrapName: string | null;
}

export interface ServerConfiguration {
  readonly runtime: RuntimeSettings;
  readonly database: DatabaseConfiguration;
  readonly redis: UrlConfiguration;
  readonly auth: AuthConfiguration;
  readonly storage: Readonly<{
    enabled: boolean;
    supabaseUrl: string | null;
    anonKey: string | null;
    serviceRoleKey: string | null;
    bucket: string | null;
    secret: string | null;
  }>;
  readonly email: Readonly<{ enabled: boolean; apiKey: string | null; from: string | null }>;
  readonly observability: Readonly<{
    enabled: boolean;
    endpoint: string | null;
    apiKey: string | null;
    sampleRate: number;
  }>;
  readonly whatsapp: Readonly<{ enabled: boolean; token: string | null }>;
  readonly ai: Readonly<{ enabled: boolean; apiKey: string | null }>;
}

export function loadEnvironment(options: EnvironmentLoadOptions = {}): EnvironmentInput {
  const environment = options.environment ?? process.env;
  const mode = readEnvironmentMode(environment);
  if (options.envFile === false) return Object.freeze({ ...environment });

  const explicitFile = options.envFile ?? readText(environment, "ENV_FILE");
  if (explicitFile === null && mode !== "development") return Object.freeze({ ...environment });
  if (
    explicitFile !== null &&
    (explicitFile.length === 0 || includesControlCharacter(explicitFile))
  ) {
    throw new ConfigurationError("ENV_FILE");
  }
  const filename = explicitFile ?? path.resolve(__dirname, "../../..", ".env");
  let fileEnvironment: Record<string, string | undefined>;
  try {
    fileEnvironment = parseEnv(readFileSync(filename, "utf8"));
  } catch (error: unknown) {
    if (
      explicitFile === null &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return Object.freeze({ ...environment });
    }
    throw new ConfigurationError("ENV_FILE");
  }
  const loaded: Record<string, unknown> = { ...fileEnvironment };
  for (const [setting, value] of Object.entries(environment)) {
    if (value !== undefined) loaded[setting] = value;
  }
  return Object.freeze(loaded);
}

export function readWebConfiguration(environment: EnvironmentInput): ClientConfiguration {
  readEnvironmentMode(environment);
  return readClientConfiguration(environment);
}

export function readServerConfiguration(
  service: "api" | "worker",
  environment: EnvironmentInput,
): ServerConfiguration {
  readClientConfiguration(environment);
  const runtime = parseRuntimeSettings(environment, {
    host: "127.0.0.1",
    port: service === "api" ? 3001 : 3002,
  });

  const database = Object.freeze({
    ...readUrlConfiguration(environment, "DATABASE", ["postgres:", "postgresql:"]),
    migrationUrl: readUrl(
      environment,
      "DATABASE_MIGRATION_URL",
      ["postgres:", "postgresql:"],
      true,
    ),
    caFile: readText(environment, "DATABASE_CA_FILE"),
  });
  const redis = readUrlConfiguration(environment, "REDIS", ["redis:", "rediss:"]);
  const authEnabled = readFlag(environment, "AUTH_ENABLED");
  const authSecret = readSecret(environment, "AUTH_SECRET", 32);
  requireSetting(authEnabled, authSecret, "AUTH_SECRET");
  const appUrl = readUrl(environment, "APP_URL", ["http:", "https:"]);
  if (appUrl !== null) {
    const parsed = new URL(appUrl);
    if (
      parsed.pathname !== "/" ||
      parsed.search ||
      (parsed.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
    ) {
      throw new ConfigurationError("APP_URL");
    }
  }
  requireSetting(authEnabled, appUrl, "APP_URL");
  const sessionText = readText(environment, "AUTH_SESSION_SECONDS");
  const sessionSeconds = sessionText === null ? (authEnabled ? 28_800 : null) : Number(sessionText);
  if (
    sessionText !== null &&
    (!/^\d+$/.test(sessionText) ||
      !Number.isSafeInteger(sessionSeconds) ||
      Number(sessionSeconds) < 300 ||
      Number(sessionSeconds) > 86_400)
  ) {
    throw new ConfigurationError("AUTH_SESSION_SECONDS");
  }
  const bootstrapEmail = readText(environment, "BOOTSTRAP_ADMIN_EMAIL", 320);
  const bootstrapName = readText(environment, "BOOTSTRAP_ADMIN_NAME", 120);
  if (bootstrapEmail !== null && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(bootstrapEmail)) {
    throw new ConfigurationError("BOOTSTRAP_ADMIN_EMAIL");
  }
  if ((bootstrapEmail === null) !== (bootstrapName === null))
    throw new ConfigurationError("BOOTSTRAP_ADMIN_NAME");

  const storageEnabled = readFlag(environment, "STORAGE_ENABLED");
  const supabaseUrl = readUrl(environment, "SUPABASE_URL", ["http:", "https:"]);
  const anonKey = readSecret(environment, "SUPABASE_ANON_KEY");
  const serviceRoleKey = readSecret(environment, "SUPABASE_SERVICE_ROLE_KEY");
  requireSetting(authEnabled, supabaseUrl, "SUPABASE_URL");
  requireSetting(authEnabled, anonKey, "SUPABASE_ANON_KEY");
  requireSetting(authEnabled, serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY");
  if (authEnabled && !database.enabled) throw new ConfigurationError("DATABASE_ENABLED");
  if (supabaseUrl !== null && authEnabled && new URL(supabaseUrl).pathname !== "/")
    throw new ConfigurationError("SUPABASE_URL");
  if (
    supabaseUrl !== null &&
    authEnabled &&
    new URL(supabaseUrl).protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(supabaseUrl).hostname)
  )
    throw new ConfigurationError("SUPABASE_URL");
  const storageSecret = readSecret(environment, "STORAGE_SECRET");
  const bucket = readText(environment, "STORAGE_BUCKET", 63);
  if (bucket !== null && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(bucket)) {
    throw new ConfigurationError("STORAGE_BUCKET");
  }
  requireSetting(storageEnabled, supabaseUrl, "SUPABASE_URL");
  requireSetting(storageEnabled, serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY");
  requireSetting(storageEnabled, bucket, "STORAGE_BUCKET");

  const emailEnabled = readFlag(environment, "EMAIL_ENABLED");
  const emailApiKey = readSecret(environment, "EMAIL_API_KEY");
  const emailFrom = readText(environment, "EMAIL_FROM", 320);
  if (emailFrom !== null && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(emailFrom)) {
    throw new ConfigurationError("EMAIL_FROM");
  }
  requireSetting(emailEnabled, emailApiKey, "EMAIL_API_KEY");
  requireSetting(emailEnabled, emailFrom, "EMAIL_FROM");

  const observabilityEnabled = readFlag(environment, "OBSERVABILITY_ENABLED");
  const observabilityEndpoint = readUrl(environment, "OBSERVABILITY_ENDPOINT", ["http:", "https:"]);
  const observabilityApiKey = readSecret(environment, "OBSERVABILITY_API_KEY");
  const sampleRateText = readText(environment, "OBSERVABILITY_SAMPLE_RATE");
  const sampleRate = sampleRateText === null ? 1 : Number(sampleRateText);
  if (
    sampleRateText !== null &&
    (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(sampleRateText) ||
      !Number.isFinite(sampleRate) ||
      sampleRate < 0 ||
      sampleRate > 1)
  ) {
    throw new ConfigurationError("OBSERVABILITY_SAMPLE_RATE");
  }
  requireSetting(observabilityEnabled, observabilityEndpoint, "OBSERVABILITY_ENDPOINT");

  const whatsappEnabled = readFlag(environment, "WHATSAPP_ENABLED");
  const whatsappToken = readSecret(environment, "WHATSAPP_TOKEN");
  requireSetting(whatsappEnabled, whatsappToken, "WHATSAPP_TOKEN");
  const aiEnabled = readFlag(environment, "AI_ENABLED");
  const aiApiKey = readSecret(environment, "AI_API_KEY");
  requireSetting(aiEnabled, aiApiKey, "AI_API_KEY");

  return Object.freeze({
    runtime,
    database,
    redis,
    auth: Object.freeze({
      enabled: authEnabled,
      secret: authSecret,
      appUrl,
      sessionSeconds,
      bootstrapEmail,
      bootstrapName,
    }),
    storage: Object.freeze({
      enabled: storageEnabled,
      supabaseUrl,
      anonKey,
      serviceRoleKey,
      bucket,
      secret: storageSecret,
    }),
    email: Object.freeze({ enabled: emailEnabled, apiKey: emailApiKey, from: emailFrom }),
    observability: Object.freeze({
      enabled: observabilityEnabled,
      endpoint: observabilityEndpoint,
      apiKey: observabilityApiKey,
      sampleRate,
    }),
    whatsapp: Object.freeze({ enabled: whatsappEnabled, token: whatsappToken }),
    ai: Object.freeze({ enabled: aiEnabled, apiKey: aiApiKey }),
  });
}

/** Build/server-only reverse-proxy destination; never part of the browser config. */
export function readWebGatewayConfiguration(environment: EnvironmentInput): {
  readonly apiUrl: string;
} {
  const apiUrl =
    readUrl(environment, "API_INTERNAL_URL", ["http:", "https:"]) ?? "http://127.0.0.1:3001";
  const parsed = new URL(apiUrl);
  if (
    parsed.pathname !== "/" ||
    parsed.search ||
    (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
  )
    throw new ConfigurationError("API_INTERNAL_URL");
  return Object.freeze({ apiUrl: parsed.origin });
}

function readUrlConfiguration(
  environment: EnvironmentInput,
  prefix: "DATABASE" | "REDIS",
  protocols: readonly string[],
): UrlConfiguration {
  const enabled = readFlag(environment, `${prefix}_ENABLED`);
  const url = readUrl(environment, `${prefix}_URL`, protocols, true);
  requireSetting(enabled, url, `${prefix}_URL`);
  return Object.freeze({ enabled, url });
}
