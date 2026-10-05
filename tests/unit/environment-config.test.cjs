const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { readClientConfiguration } = require("../../packages/config/dist/client.js");
const {
  ConfigurationError,
  loadEnvironment,
  readEnvironmentMode,
  readServerConfiguration,
  readWebConfiguration,
} = require("../../packages/config/dist/server.js");

const enabledEnvironment = Object.freeze({
  DATABASE_ENABLED: "true",
  DATABASE_URL: "postgresql://test_user:fake_value@database.example.invalid:5432/airmech",
  REDIS_ENABLED: "true",
  REDIS_URL: "rediss://test_user:fake_value@redis.example.invalid:6380/0",
  AUTH_ENABLED: "true",
  AUTH_SECRET: "a".repeat(32),
  APP_URL: "https://app.example.invalid",
  STORAGE_ENABLED: "true",
  SUPABASE_URL: "https://storage.example.invalid",
  SUPABASE_ANON_KEY: "fake-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
  STORAGE_BUCKET: "airmech-private",
  STORAGE_SECRET: "fake-reserved-storage-secret",
  EMAIL_ENABLED: "true",
  EMAIL_API_KEY: "fake-email-api-key",
  EMAIL_FROM: "no-reply@example.invalid",
  OBSERVABILITY_ENABLED: "true",
  OBSERVABILITY_ENDPOINT: "https://telemetry.example.invalid/events",
  OBSERVABILITY_API_KEY: "fake-observability-api-key",
  OBSERVABILITY_SAMPLE_RATE: "0.5",
  WHATSAPP_ENABLED: "true",
  WHATSAPP_TOKEN: "fake-whatsapp-token",
  AI_ENABLED: "true",
  AI_API_KEY: "fake-ai-api-key",
});

function expectSettingError(callback, setting) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof ConfigurationError);
    assert.equal(error.setting, setting);
    assert.equal(error.name, "ConfigurationError");
    assert.equal("cause" in error, false);
    return true;
  });
}

function environmentFixture(t, contents) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = mkdtempSync(path.join(temporaryRoot, "airmech-environment-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    assert.ok(path.basename(directory).startsWith("airmech-environment-"));
    rmSync(directory, { recursive: true, force: true });
  });
  const filename = path.join(directory, ".env");
  writeFileSync(filename, contents, "utf8");
  return { directory, filename };
}

test("should keep future integrations disabled and return immutable runtime defaults", () => {
  const environment = Object.freeze({});
  const api = readServerConfiguration("api", environment);
  const worker = readServerConfiguration("worker", environment);
  assert.deepEqual(api.runtime, { host: "127.0.0.1", port: 3001, environment: "development" });
  assert.deepEqual(worker.runtime, { host: "127.0.0.1", port: 3002, environment: "development" });
  for (const [name, group] of Object.entries(api)) {
    assert.ok(Object.isFrozen(group), name);
    if (name === "runtime") continue;
    assert.equal(group.enabled, false, name);
    for (const [field, value] of Object.entries(group)) {
      if (field === "enabled") continue;
      assert.equal(value, field === "sampleRate" ? 1 : null, `${name}.${field}`);
    }
  }
  assert.ok(Object.isFrozen(api));
  assert.deepEqual(environment, {});
});

test("should parse complete enabled configuration without connecting to providers", () => {
  const configuration = readServerConfiguration("api", {
    ...enabledEnvironment,
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "4101",
  });
  assert.deepEqual(configuration.runtime, {
    host: "0.0.0.0",
    port: 4101,
    environment: "production",
  });
  for (const [name, group] of Object.entries(configuration)) {
    if (name !== "runtime") assert.equal(group.enabled, true, name);
  }
  assert.equal(configuration.database.url, enabledEnvironment.DATABASE_URL);
  assert.equal(configuration.redis.url, enabledEnvironment.REDIS_URL);
  assert.equal(configuration.auth.secret, enabledEnvironment.AUTH_SECRET);
  assert.equal(configuration.storage.bucket, enabledEnvironment.STORAGE_BUCKET);
  assert.equal(configuration.storage.anonKey, enabledEnvironment.SUPABASE_ANON_KEY);
  assert.equal(configuration.storage.serviceRoleKey, enabledEnvironment.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(configuration.storage.secret, enabledEnvironment.STORAGE_SECRET);
  assert.equal(configuration.email.from, enabledEnvironment.EMAIL_FROM);
  assert.equal(configuration.observability.sampleRate, 0.5);
  assert.equal(configuration.whatsapp.token, enabledEnvironment.WHATSAPP_TOKEN);
  assert.equal(configuration.ai.apiKey, enabledEnvironment.AI_API_KEY);
});

test("should require each integration's credentials only when its feature is enabled", () => {
  const missingSettings = [
    [{ DATABASE_ENABLED: "true" }, "DATABASE_URL"],
    [{ REDIS_ENABLED: "true" }, "REDIS_URL"],
    [{ AUTH_ENABLED: "true" }, "AUTH_SECRET"],
    [{ STORAGE_ENABLED: "true" }, "SUPABASE_URL"],
    [
      { STORAGE_ENABLED: "true", SUPABASE_URL: enabledEnvironment.SUPABASE_URL },
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    [
      {
        STORAGE_ENABLED: "true",
        SUPABASE_URL: enabledEnvironment.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: "fake-key",
      },
      "STORAGE_BUCKET",
    ],
    [{ EMAIL_ENABLED: "true" }, "EMAIL_API_KEY"],
    [{ EMAIL_ENABLED: "true", EMAIL_API_KEY: "fake-key" }, "EMAIL_FROM"],
    [{ OBSERVABILITY_ENABLED: "true" }, "OBSERVABILITY_ENDPOINT"],
    [{ WHATSAPP_ENABLED: "true" }, "WHATSAPP_TOKEN"],
    [{ AI_ENABLED: "true" }, "AI_API_KEY"],
  ];
  for (const [environment, setting] of missingSettings) {
    expectSettingError(() => readServerConfiguration("worker", environment), setting);
  }
  const environment = { ...enabledEnvironment };
  for (const setting of Object.keys(environment)) {
    if (setting.endsWith("_ENABLED")) environment[setting] = "false";
  }
  const configuration = readServerConfiguration("api", environment);
  assert.equal(configuration.database.enabled, false);
  assert.equal(configuration.database.url, enabledEnvironment.DATABASE_URL);
  assert.equal(configuration.auth.secret, enabledEnvironment.AUTH_SECRET);
  assert.equal(configuration.storage.secret, enabledEnvironment.STORAGE_SECRET);
});

test("should reject ambiguous feature flags instead of silently enabling or disabling services", () => {
  const flags = Object.keys(enabledEnvironment).filter((setting) => setting.endsWith("_ENABLED"));
  for (const setting of flags) {
    for (const value of ["1", "TRUE", " false", "", true, null, {}]) {
      expectSettingError(() => readServerConfiguration("api", { [setting]: value }), setting);
    }
  }
});

test("should reject malformed supplied URLs even while integrations are disabled", () => {
  const malformedUrls = [
    ["DATABASE_URL", "https://database.example.invalid"],
    ["DATABASE_URL", "postgresql://database.example.invalid:65536/airmech"],
    ["DATABASE_URL", "postgresql://database.example.invalid:0/airmech"],
    ["DATABASE_URL", "postgresql:///airmech"],
    ["REDIS_URL", "postgresql://redis.example.invalid"],
    ["REDIS_URL", "redis://redis.example.invalid:not-a-port"],
    ["SUPABASE_URL", "ftp://storage.example.invalid"],
    ["SUPABASE_URL", "https://user:fake-secret@storage.example.invalid"],
    ["OBSERVABILITY_ENDPOINT", "https://telemetry.example.invalid/#fragment"],
    ["OBSERVABILITY_ENDPOINT", "https://telemetry.example.invalid/a b"],
    ["OBSERVABILITY_ENDPOINT", "https://telemetry.example.invalid/\n"],
    ["REDIS_URL", { hostname: "redis.example.invalid" }],
  ];
  for (const [setting, value] of malformedUrls) {
    expectSettingError(() => readServerConfiguration("api", { [setting]: value }), setting);
  }
  for (const protocol of ["postgres", "postgresql"]) {
    assert.equal(
      readServerConfiguration("api", {
        DATABASE_URL: `${protocol}://user:fake@database.example.invalid/db`,
      }).database.enabled,
      false,
    );
  }
  for (const protocol of ["redis", "rediss"]) {
    assert.equal(
      readServerConfiguration("api", {
        REDIS_URL: `${protocol}://user:fake@redis.example.invalid/0`,
      }).redis.enabled,
      false,
    );
  }
});

test("should validate secrets, mailboxes, buckets and sampling rates independently of feature flags", () => {
  const secretSettings = [
    "AUTH_SECRET",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STORAGE_SECRET",
    "EMAIL_API_KEY",
    "OBSERVABILITY_API_KEY",
    "WHATSAPP_TOKEN",
    "AI_API_KEY",
  ];
  for (const setting of secretSettings) {
    for (const value of ["", "fake secret", "fake\nsecret", 42, null]) {
      expectSettingError(() => readServerConfiguration("api", { [setting]: value }), setting);
    }
  }
  expectSettingError(
    () => readServerConfiguration("api", { AUTH_SECRET: "a".repeat(31) }),
    "AUTH_SECRET",
  );
  for (const value of ["invalid", "Name <user@example.invalid>", "user@example.invalid\nextra"]) {
    expectSettingError(() => readServerConfiguration("api", { EMAIL_FROM: value }), "EMAIL_FROM");
  }
  for (const value of ["../private", "bucket with spaces", "_private", "b".repeat(64)]) {
    expectSettingError(
      () => readServerConfiguration("api", { STORAGE_BUCKET: value }),
      "STORAGE_BUCKET",
    );
  }
  for (const value of ["-0.1", "1.1", "NaN", "Infinity", "0.5extra", "1e0", 0.5]) {
    expectSettingError(
      () => readServerConfiguration("api", { OBSERVABILITY_SAMPLE_RATE: value }),
      "OBSERVABILITY_SAMPLE_RATE",
    );
  }
  for (const value of ["0", ".5", "1"]) {
    assert.equal(
      readServerConfiguration("api", { OBSERVABILITY_SAMPLE_RATE: value }).observability.sampleRate,
      Number(value),
    );
  }
});

test("should expose only the allowlisted public app name and reject accidental public secrets", () => {
  assert.deepEqual(readClientConfiguration({}), { appName: "Airmech One" });
  const publicConfiguration = readClientConfiguration({
    ...enabledEnvironment,
    NEXT_PUBLIC_APP_NAME: "Airmech Test",
  });
  assert.deepEqual(publicConfiguration, { appName: "Airmech Test" });
  assert.ok(Object.isFrozen(publicConfiguration));
  for (const setting of [
    "NEXT_PUBLIC_AUTH_SECRET",
    "NEXT_PUBLIC_DATABASE_URL",
    "NEXT_PUBLIC_OTHER",
  ]) {
    expectSettingError(() => readClientConfiguration({ [setting]: "fake-value" }), setting);
    expectSettingError(() => readServerConfiguration("api", { [setting]: undefined }), setting);
  }
  for (const value of ["", " Airmech", "Airmech\nOne", "a".repeat(81), { name: "Airmech" }]) {
    expectSettingError(
      () => readClientConfiguration({ NEXT_PUBLIC_APP_NAME: value }),
      "NEXT_PUBLIC_APP_NAME",
    );
  }
});

test("should validate the web environment without requiring backend provider settings", () => {
  assert.deepEqual(
    readWebConfiguration({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_NAME: "Airmech Web",
      PORT: "bad-port",
      DATABASE_ENABLED: "true",
      AUTH_SECRET: "short",
    }),
    { appName: "Airmech Web" },
  );
  for (const mode of ["development", "test", "production"])
    assert.equal(readEnvironmentMode({ NODE_ENV: mode }), mode);
  expectSettingError(() => readWebConfiguration({ NODE_ENV: "staging" }), "NODE_ENV");
  expectSettingError(() => readServerConfiguration("api", { PORT: "3001extra" }), "PORT");
  expectSettingError(() => readServerConfiguration("worker", { HOST: "host with spaces" }), "HOST");
});

test("should report invalid setting names without leaking secret values or parser causes", () => {
  const sentinel = "never-disclose-this-fake-secret";
  for (const [setting, value] of [
    ["AUTH_SECRET", `${sentinel} secret`],
    ["REDIS_URL", `redis://${sentinel}:70000`],
    ["SUPABASE_URL", `https://user:${sentinel}@storage.example.invalid`],
  ]) {
    assert.throws(
      () => readServerConfiguration("api", { [setting]: value }),
      (error) => {
        assert.ok(error instanceof ConfigurationError);
        assert.equal(error.setting, setting);
        assert.equal(
          `${error.message}\n${error.stack}\n${JSON.stringify(error)}`.includes(sentinel),
          false,
        );
        assert.equal("cause" in error, false);
        return true;
      },
    );
  }
});

test("should load explicit environment files with process precedence and no global mutation or expansion", (t) => {
  const { filename } = environmentFixture(
    t,
    '# Native dotenv quotes and comments\nNODE_ENV=test\nNEXT_PUBLIC_APP_NAME="Airmech File"\nPORT=4101\nFILE_ONLY=fake-value\nLITERAL=${FILE_ONLY}\nUNDEFINED_SOURCE=from-file\n',
  );
  const source = Object.freeze({ NODE_ENV: "test", PORT: "4201", UNDEFINED_SOURCE: undefined });
  const processSnapshot = JSON.stringify(process.env);
  const loaded = loadEnvironment({ environment: source, envFile: filename });
  assert.equal(loaded.PORT, "4201");
  assert.equal(loaded.NEXT_PUBLIC_APP_NAME, "Airmech File");
  assert.equal(loaded.FILE_ONLY, "fake-value");
  assert.equal(loaded.UNDEFINED_SOURCE, "from-file");
  assert.equal(loaded.LITERAL, "${FILE_ONLY}");
  assert.ok(Object.isFrozen(loaded));
  assert.equal(source.PORT, "4201");
  assert.equal(
    JSON.stringify(process.env) === processSnapshot,
    true,
    "loading must not mutate process.env",
  );
});

test("should honor explicit file selection in all modes and allow fixtures to disable loading", (t) => {
  const { directory, filename } = environmentFixture(t, "FILE_ONLY=fake-value\n");
  for (const mode of ["development", "test", "production"]) {
    assert.equal(
      loadEnvironment({ environment: { NODE_ENV: mode, ENV_FILE: filename } }).FILE_ONLY,
      "fake-value",
    );
    assert.equal(
      loadEnvironment({
        environment: { NODE_ENV: mode, ENV_FILE: path.join(directory, "missing") },
        envFile: filename,
      }).FILE_ONLY,
      "fake-value",
    );
  }
  for (const mode of ["test", "production"]) {
    assert.deepEqual(
      loadEnvironment({ environment: { NODE_ENV: mode, LOCAL_ONLY: "fake-process-value" } }),
      { NODE_ENV: mode, LOCAL_ONLY: "fake-process-value" },
    );
  }
  const source = Object.freeze({ NODE_ENV: "test", ENV_FILE: path.join(directory, "missing") });
  const loaded = loadEnvironment({ environment: source, envFile: false });
  assert.deepEqual(loaded, source);
  assert.notEqual(loaded, source);
});

test("should reject missing or unreadable explicit files without exposing filesystem details", (t) => {
  const { directory } = environmentFixture(t, "NODE_ENV=test\n");
  for (const filename of [
    path.join(directory, "missing-private-file.env"),
    directory,
    "",
    "invalid\u0000file",
  ]) {
    assert.throws(
      () => loadEnvironment({ environment: { NODE_ENV: "test" }, envFile: filename }),
      (error) => {
        assert.ok(error instanceof ConfigurationError);
        assert.equal(error.setting, "ENV_FILE");
        assert.equal(
          `${error.message}\n${error.stack}\n${JSON.stringify(error)}`.includes(directory),
          false,
        );
        assert.equal("cause" in error, false);
        return true;
      },
    );
  }
});
