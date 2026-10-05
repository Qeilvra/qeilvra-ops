const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const { ESLint } = require("eslint");
const { createTestEnvironment } = require("@airmech/testing");

const workspace = path.resolve(__dirname, "../..");

test("API and worker resolve server infrastructure while browser exports reject it", () => {
  for (const app of ["api", "worker"]) {
    const load = createRequire(path.join(workspace, `apps/${app}/package.json`));
    for (const name of ["database", "queue", "storage"]) {
      assert.ok(load(`@airmech/${name}`));
    }
  }
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=browser",
      "-e",
      `const assert=require('node:assert/strict'); for(const name of ['database','queue','storage']) assert.throws(()=>require('@airmech/'+name),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});`,
    ],
    {
      cwd: workspace,
      env: createTestEnvironment({}, process.env),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("server queue and storage imports cannot enter browser/UI/contracts/config", async () => {
  const eslint = new ESLint({ cwd: workspace });
  for (const owner of [
    "apps/web/src/app/page.tsx",
    "packages/ui/src/index.tsx",
    "packages/contracts/src/index.ts",
    "packages/config/src/index.ts",
  ]) {
    for (const name of ["queue", "storage", "database"]) {
      for (const code of [
        `import '@airmech/${name}';`,
        `export async function probe() { return await import('@airmech/${name}'); }`,
      ]) {
        const [result] = await eslint.lintText(code, { filePath: path.join(workspace, owner) });
        assert.ok(
          result.messages.some(
            (message) =>
              message.ruleId === "airmech/package-boundaries" ||
              message.ruleId === "no-restricted-imports",
          ),
        );
      }
    }
  }
});

test("API infrastructure construction stays offline and is owned by application shutdown", async () => {
  const { createApiApplication } = await import("../../apps/api/dist/application.js");
  const { readServerConfiguration } = require("@airmech/config/server");
  const configuration = readServerConfiguration("api", {
    DATABASE_ENABLED: "true",
    DATABASE_URL: "postgresql://offline.invalid/db",
    REDIS_ENABLED: "true",
    REDIS_URL: "redis://offline.invalid:6379",
  });
  const app = await createApiApplication(configuration);
  await app.init();
  await app.close();
});
