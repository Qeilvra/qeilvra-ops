import { ConfigurationError, type EnvironmentInput, readText } from "./validation";

export type RuntimeEnvironment = "development" | "test" | "production";

export interface RuntimeSettings {
  readonly host: string;
  readonly port: number;
  readonly environment: RuntimeEnvironment;
}

export function readEnvironmentMode(environment: EnvironmentInput): RuntimeEnvironment {
  const value = readText(environment, "NODE_ENV") ?? "development";
  if (value !== "development" && value !== "test" && value !== "production") {
    throw new ConfigurationError("NODE_ENV");
  }
  return value;
}

export function readRuntimeSettings(
  environment: Readonly<Record<string, string | undefined>>,
  defaults: Readonly<{ host: string; port: number }>,
): RuntimeSettings {
  return parseRuntimeSettings(environment, defaults);
}

export function parseRuntimeSettings(
  environment: EnvironmentInput,
  defaults: Readonly<{ host: string; port: number }>,
): RuntimeSettings {
  const runtimeEnvironment = readEnvironmentMode(environment);
  const portText = readText(environment, "PORT") ?? String(defaults.port);
  if (!/^\d{1,5}$/.test(portText)) throw new ConfigurationError("PORT");
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError("PORT");
  }

  const host = readText(environment, "HOST", 253) ?? defaults.host;
  if (host.length === 0 || host.length > 253 || !/^[a-zA-Z0-9.:_-]+$/.test(host)) {
    throw new ConfigurationError("HOST");
  }

  return Object.freeze({ host, port, environment: runtimeEnvironment });
}
