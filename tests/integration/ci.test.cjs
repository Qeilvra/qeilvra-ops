const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseDocument } = require("yaml");

const workspace = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(workspace, ".github/workflows/ci.yml"), "utf8");
const document = parseDocument(source, { uniqueKeys: true, version: "1.2" });
const workflow = document.toJS({ maxAliasCount: 0 });
const manifest = JSON.parse(fs.readFileSync(path.join(workspace, "package.json"), "utf8"));

function runStep(command) {
  const steps = workflow.jobs.quality.steps.filter((step) => step.run === command);
  assert.equal(steps.length, 1, `${command} must run exactly once`);
  assert.equal(steps[0].if, undefined, `${command} cannot be skipped conditionally`);
  return steps[0];
}

test("CI is valid YAML with PR, main push, and manual triggers", () => {
  assert.deepEqual(document.errors, []);
  assert.deepEqual(document.warnings, []);
  assert.ok(Object.hasOwn(workflow.on, "pull_request"));
  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.ok(workflow.on.push.branches.includes("main"));
  assert.equal(workflow.on.pull_request_target, undefined);
  assert.equal(workflow.concurrency["cancel-in-progress"], true);
  assert.match(workflow.concurrency.group, /github\.event\.pull_request\.number/);
});

test("CI uses immutable actions and a read-only token on a bounded hosted runner", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.ok(workflow.jobs.quality);
  const job = workflow.jobs.quality;
  assert.match(job["runs-on"], /^ubuntu-/);
  assert.ok(job["timeout-minutes"] > 0 && job["timeout-minutes"] <= 30);
  assert.equal(job.defaults.run.shell, "bash");
  assert.equal(job["continue-on-error"], undefined);
  for (const step of job.steps) {
    assert.equal(step["continue-on-error"], undefined);
    if (step.uses) assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
    if (step.run) assert.doesNotMatch(step.run, /\|\|\s*true|exit\s+0|set\s+\+e/);
  }
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with["persist-credentials"], false);
  const node = job.steps.find((step) => step.uses?.startsWith("actions/setup-node@"));
  const [major, minor] = node.with["node-version"].split(".").map(Number);
  assert.equal(major, 24);
  assert.ok(minor >= 14, "Node must satisfy the foundation's supported runtime range");
});

test("CI installs once from the lockfile and reuses the project's complete quality gate", () => {
  const steps = workflow.jobs.quality.steps;
  runStep("pnpm install --frozen-lockfile");
  runStep("pnpm exec playwright install --with-deps chromium");
  runStep("pnpm check");
  assert.equal(steps.filter((step) => step.run?.startsWith("pnpm install")).length, 1);
  assert.equal(steps.filter((step) => step.run === "pnpm build").length, 0);
  const required = [
    "build",
    "lint",
    "format:check",
    "typecheck:workspace",
    "test:run",
    "test:smoke",
    "test:browser",
    "audit",
  ];
  const gate = manifest.scripts.check.split(" && ");
  for (const script of required) {
    assert.equal(gate.filter((command) => command === `pnpm run ${script}`).length, 1);
  }
  assert.equal(gate[0], "pnpm run build", "build artifacts must exist before typed lint");
  const setup = steps.find((step) => step.uses?.startsWith("pnpm/action-setup@"));
  assert.equal(setup.with.run_install, false);
  assert.equal(setup.with.cache, true);
  assert.equal(setup.with.cache_dependency_path, "pnpm-lock.yaml");
  assert.equal(setup.with.version, undefined, "pnpm version must come from packageManager");
  assert.match(manifest.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
  assert.equal(manifest.packageManager.slice(5), manifest.engines.pnpm);
  const node = steps.find((step) => step.uses?.startsWith("actions/setup-node@"));
  assert.equal(node.with["package-manager-cache"], false, "only one store cache is needed");
});

test("live CI tests use health-checked disposable services, with migration after build", () => {
  const { services, steps } = workflow.jobs.quality;
  assert.match(services.postgres.image, /^postgres:\d+(?:\.\d+)*-alpine$/);
  assert.match(services.redis.image, /^redis:\d+(?:\.\d+)*-alpine$/);
  assert.deepEqual(services.postgres.ports, ["127.0.0.1:5432:5432"]);
  assert.deepEqual(services.redis.ports, ["127.0.0.1:6379:6379"]);
  for (const service of Object.values(services)) {
    assert.match(service.options, /--health-cmd/);
    assert.match(service.options, /--health-retries \d+/);
    assert.equal(service.volumes, undefined, "service data must not persist across runs");
  }
  const migrate = runStep("pnpm db:migrate");
  const live = runStep("pnpm test:live");
  const gate = runStep("pnpm check");
  assert.ok(steps.indexOf(migrate) > steps.indexOf(gate));
  assert.ok(steps.indexOf(live) > steps.indexOf(migrate));
  for (const step of [migrate, live]) {
    assert.equal(step.env.NODE_ENV, "test", "live checks must not load the developer dotenv file");
    assert.equal(step.env.DATABASE_ENABLED, "true");
    const database = new URL(step.env.DATABASE_URL);
    assert.equal(database.hostname, "127.0.0.1");
    assert.equal(database.password, "");
    assert.equal(database.username, services.postgres.env.POSTGRES_USER);
    assert.equal(database.pathname, `/${services.postgres.env.POSTGRES_DB}`);
  }
  const redis = new URL(live.env.REDIS_URL);
  assert.equal(redis.hostname, "127.0.0.1");
  assert.equal(redis.password, "");
  assert.equal(live.env.REDIS_ENABLED, "true");
  assert.equal(live.env.INFRASTRUCTURE_TEST_DATABASE_MUTATIONS, "true");
  assert.equal(live.env.STORAGE_ENABLED, "false", "cloud storage verification runs separately");
  assert.equal(gate.env, undefined, "ordinary quality tests require no provider connection");
  assert.doesNotMatch(source, /secrets\.|SUPABASE_SERVICE_ROLE_KEY|AUTH_SECRET|POSTGRES_PASSWORD/);
});
