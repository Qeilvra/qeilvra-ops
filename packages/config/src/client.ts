import { ConfigurationError, type EnvironmentInput, readText } from "./validation";

export interface ClientConfiguration {
  readonly appName: string;
}

export function readClientConfiguration(environment: EnvironmentInput): ClientConfiguration {
  for (const setting of Object.keys(environment)) {
    if (setting.startsWith("NEXT_PUBLIC_") && setting !== "NEXT_PUBLIC_APP_NAME") {
      throw new ConfigurationError(setting);
    }
  }
  const appName = readText(environment, "NEXT_PUBLIC_APP_NAME", 80) ?? "Airmech One";
  return Object.freeze({ appName });
}
