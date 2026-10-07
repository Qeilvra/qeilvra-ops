const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { parseEnv } = require("node:util");
const { createTestEnvironment } = require("@airmech/testing");

const workspace = path.resolve(__dirname, "../..");

function inFixture(run) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(temporaryRoot, "airmech-environment-"));
  try {
    return run(fixture);
  } finally {
    assert.equal(path.dirname(path.resolve(fixture)), temporaryRoot);
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: workspace,
    env: createTestEnvironment({}, process.env),
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 128 * 1024,
    ...options,
  });
}

test("test children retain OS essentials without inheriting integration secrets or Node options", () => {
  const source = {
    SystemRoot: "C:\\Windows",
    Path: "C:\\approved-bin",
    HOME: "/approved-home",
    AUTH_SECRET: "private-auth-sentinel",
    DATABASE_URL: "postgres://private-database-sentinel",
    REDIS_ENABLED: "true",
    NEXT_PUBLIC_AUTH_SECRET: "private-public-sentinel",
    NODE_OPTIONS: "--import private-module-sentinel",
    ENV_FILE: "/private-file-sentinel",
    NODE_ENV: "production",
    PLAYWRIGHT_CHROMIUM_EXECUTABLE: "/private-browser-sentinel",
  };
  const before = { ...source };
  const isolated = createTestEnvironment({ PORT: "3210", NODE_ENV: "production" }, source);
  assert.deepEqual(isolated, {
    SystemRoot: source.SystemRoot,
    Path: source.Path,
    HOME: source.HOME,
    NODE_ENV: "production",
    PORT: "3210",
  });
  assert.deepEqual(source, before);
  assert.deepEqual(createTestEnvironment(), { NODE_ENV: "test" });
  assert.deepEqual(createTestEnvironment({}, {}), { NODE_ENV: "test" });
});

test("compiled API and worker reject active missing settings before startup without leaking values", () => {
  inFixture((fixture) => {
    for (const service of ["api", "worker"]) {
      const result = runNode([path.join(workspace, `apps/${service}/dist/main.js`)], {
        cwd: fixture,
        env: createTestEnvironment(
          { NODE_ENV: "production", DATABASE_ENABLED: "true" },
          process.env,
        ),
      });
      assert.equal(
        result.error,
        undefined,
        `${service} configuration failure must finish promptly`,
      );
      assert.equal(result.status, 1, result.stderr);
      assert.ok(!result.stdout.includes("process_started"));
      const event = JSON.parse(result.stderr.trim());
      assert.equal(event.event, "startup_failed");
      assert.equal(event.code, "INVALID_CONFIGURATION");
      assert.equal(event.service, service);
      assert.match(event.message, /\bDATABASE_URL\b/);
      assert.ok(!result.stderr.includes(fixture));
      assert.ok(!("stack" in event));
    }
  });
});

test("compiled API and worker redact malformed Redis credentials even when Redis is inactive", () => {
  inFixture((fixture) => {
    const sentinels = [
      "private-user-sentinel",
      "private-password-sentinel",
      "private-host-sentinel",
    ];
    const redisUrl = `redis://${sentinels[0]}:${sentinels[1]}@${sentinels[2]}.invalid:70000/0`;
    for (const service of ["api", "worker"]) {
      const result = runNode([path.join(workspace, `apps/${service}/dist/main.js`)], {
        cwd: fixture,
        env: createTestEnvironment({ NODE_ENV: "production", REDIS_URL: redisUrl }, process.env),
      });
      assert.equal(
        result.error,
        undefined,
        `${service} invalid URL must not leave a process running`,
      );
      assert.equal(result.status, 1, result.stderr);
      assert.ok(!result.stdout.includes("process_started"));
      const event = JSON.parse(result.stderr.trim());
      assert.equal(event.event, "startup_failed");
      assert.equal(event.code, "INVALID_CONFIGURATION");
      assert.match(event.message, /\bREDIS_URL\b/);
      const output = result.stdout + result.stderr;
      for (const sentinel of sentinels) assert.ok(!output.includes(sentinel));
      assert.ok(!output.includes(redisUrl));
      assert.ok(!output.includes(fixture));
      assert.ok(!("stack" in event));
    }
  });
});

test("browser resolution permits public configuration and rejects both server entry points", () => {
  const rootManifest = path.join(workspace, "package.json");
  const probe = `const assert = require("node:assert/strict");
    const { createRequire } = require("node:module");
    const load = createRequire(${JSON.stringify(rootManifest)});
    for (const name of ["@airmech/config", "@airmech/config/server"]) {
      assert.throws(() => load(name), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    }
    const { readClientConfiguration } = load("@airmech/config/client");
    assert.deepEqual(readClientConfiguration({}), { appName: "Airmech One" });`;
  const result = runNode(["--conditions=browser", "-e", probe]);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test("the public configuration artifact graph contains no server imports or secret keys", () => {
  const visited = new Set();
  const secretKeys = [
    "DATABASE_URL",
    "REDIS_URL",
    "AUTH_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STORAGE_SECRET",
    "EMAIL_API_KEY",
    "OBSERVABILITY_API_KEY",
    "WHATSAPP_TOKEN",
    "AI_API_KEY",
  ];
  function visit(filename) {
    if (visited.has(filename)) return;
    visited.add(filename);
    const source = fs.readFileSync(filename, "utf8");
    for (const key of secretKeys) assert.ok(!source.includes(key), `${filename} exposes ${key}`);
    for (const match of source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
      const specifier = match[1];
      assert.ok(specifier.startsWith("."), `${filename} imports ${specifier}`);
      const imported = require.resolve(path.resolve(path.dirname(filename), specifier));
      visit(imported);
    }
  }
  visit(require.resolve("@airmech/config/client"));
  assert.ok(visited.size > 0);
});

test("Next validates the app name with optional Vercel metadata and no legacy environment map", () => {
  const probe = `const assert = require("node:assert/strict");
    const publicKeys = Object.keys(process.env).filter((key) => key.startsWith("NEXT_PUBLIC_"));
    const imported = require(${JSON.stringify(path.join(workspace, "apps/web/next.config.ts"))});
    const configuration = imported.default ?? imported;
    assert.equal(configuration.env, undefined);
    assert.equal(process.env.NEXT_PUBLIC_APP_NAME, "Airmech One");
    assert.deepEqual(Object.keys(process.env).filter((key) => key.startsWith("NEXT_PUBLIC_")).sort(), [...publicKeys, "NEXT_PUBLIC_APP_NAME"].sort());
    assert.deepEqual(require("@airmech/config/server").readWebConfiguration(process.env), { appName: "Airmech One" });`;
  for (const metadata of [
    {},
    {
      NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: "feat/identity-access-and-shared-ui",
      NEXT_PUBLIC_VERCEL_GIT_COMMIT_MESSAGE: "Fix preview\n\nBuild shared dependencies.\n",
      NEXT_PUBLIC_VERCEL_GIT_COMMIT_AUTHOR_NAME: "Developer Name",
      NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID: "",
    },
    { NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: "" },
  ]) {
    const result = runNode(["-e", probe], {
      env: createTestEnvironment({ NODE_ENV: "production", ...metadata }, process.env),
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  }
});

test("the environment example parses with inactive providers and contains no usable secrets", () => {
  const { readServerConfiguration } = require("@airmech/config/server");
  const environment = parseEnv(fs.readFileSync(path.join(workspace, ".env.example"), "utf8"));
  for (const service of ["api", "worker"]) {
    const configuration = readServerConfiguration(service, environment);
    for (const provider of [
      "database",
      "redis",
      "auth",
      "storage",
      "email",
      "observability",
      "whatsapp",
      "ai",
    ]) {
      assert.equal(
        configuration[provider].enabled,
        false,
        `${provider} must be inactive in the example`,
      );
      for (const [key, value] of Object.entries(configuration[provider])) {
        if (key !== "enabled" && key !== "sampleRate") {
          assert.equal(
            value,
            null,
            `${provider}.${key} must not contain a usable example credential`,
          );
        }
      }
    }
  }
});

test("Git ignores local environment files while permitting the committed example", () => {
  inFixture((fixture) => {
    const environment = createTestEnvironment(
      { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "" },
      process.env,
    );
    const initialized = spawnSync("git", ["init", "--quiet"], {
      cwd: fixture,
      env: environment,
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    });
    assert.equal(initialized.error, undefined);
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.copyFileSync(path.join(workspace, ".gitignore"), path.join(fixture, ".gitignore"));
    const ignored = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
      cwd: fixture,
      env: environment,
      input: ".env\n.env.local\n.env.production\napps/web/.env.local\n.env.example\n",
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    });
    assert.equal(ignored.error, undefined);
    assert.equal(ignored.status, 0, ignored.stderr);
    assert.deepEqual(ignored.stdout.trim().split(/\r?\n/), [
      ".env",
      ".env.local",
      ".env.production",
      "apps/web/.env.local",
    ]);
  });
});
