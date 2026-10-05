export type EnvironmentInput = Readonly<Record<string, unknown>>;

export function includesControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export class ConfigurationError extends Error {
  constructor(readonly setting: string) {
    super(`The ${setting} setting is invalid. Correct the server configuration and restart.`);
    this.name = "ConfigurationError";
  }
}

export function readText(
  environment: EnvironmentInput,
  setting: string,
  maximumLength = 4096,
): string | null {
  const value = environment[setting];
  if (value === undefined) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    includesControlCharacter(value)
  ) {
    throw new ConfigurationError(setting);
  }
  return value;
}

export function readFlag(environment: EnvironmentInput, setting: string): boolean {
  const value = readText(environment, setting);
  if (value === null || value === "false") return false;
  if (value === "true") return true;
  throw new ConfigurationError(setting);
}

export function readSecret(
  environment: EnvironmentInput,
  setting: string,
  minimumLength = 1,
): string | null {
  const value = readText(environment, setting);
  if (value !== null && (value.length < minimumLength || /\s/.test(value))) {
    throw new ConfigurationError(setting);
  }
  return value;
}

export function readUrl(
  environment: EnvironmentInput,
  setting: string,
  protocols: readonly string[],
  allowCredentials = false,
): string | null {
  const value = readText(environment, setting);
  if (value === null) return null;
  try {
    const url = new URL(value);
    if (
      /\s/.test(value) ||
      !protocols.includes(url.protocol) ||
      url.hostname.length === 0 ||
      url.port === "0" ||
      url.hash.length > 0 ||
      (!allowCredentials && (url.username.length > 0 || url.password.length > 0))
    ) {
      throw new ConfigurationError(setting);
    }
  } catch {
    // URL parser errors can contain the input. Preserve only the trusted setting name.
    throw new ConfigurationError(setting);
  }
  return value;
}

export function requireSetting(enabled: boolean, value: string | null, setting: string): void {
  if (enabled && value === null) throw new ConfigurationError(setting);
}
