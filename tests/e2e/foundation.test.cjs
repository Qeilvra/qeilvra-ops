const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { assertApiErrorResponse, createTestEnvironment } = require("@airmech/testing");

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startApplication(t, name, entry, args = []) {
  const port = await unusedPort();
  const child = spawn(
    process.execPath,
    [entry, ...args, ...(name === "web" ? ["--port", String(port)] : [])],
    {
      cwd: name === "web" ? path.resolve("apps/web") : process.cwd(),
      env: createTestEnvironment(
        {
          PORT: String(port),
          HOST: "127.0.0.1",
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_NAME: "Airmech One",
          NEXT_TELEMETRY_DISABLED: "1",
        },
        process.env,
      ),
      windowsHide: true,
      stdio: "ignore",
    },
  );
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });
  t.after(async () => {
    if (child.exitCode === null && !child.killed) {
      const stopped = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await Promise.race([stopped, delay(3000)]);
    }
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(spawnError, undefined, `${name} process could not start`);
    assert.equal(child.exitCode, null, `${name} process exited before becoming usable`);
    try {
      const response = await fetch(`${baseUrl}${name === "web" ? "/" : "/health"}`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.status === 200) return baseUrl;
    } catch {
      // A process may not have bound its listener yet. This bounded startup probe retries only that condition.
    }
    await delay(100);
  }
  assert.fail(`${name} did not become usable within the startup timeout`);
}

test("compiled API starts with safe health, correlation, and missing-route responses", async (t) => {
  const baseUrl = await startApplication(t, "api", path.resolve("apps/api/dist/main.js"));
  const response = await fetch(`${baseUrl}/health`, {
    headers: { "x-request-id": "req_smoke_001" },
  });
  assert.deepEqual(await response.json(), { status: "ok", service: "api" });
  assert.equal(response.headers.get("x-request-id"), "req_smoke_001");
  const missing = await fetch(`${baseUrl}/not-an-api-route`);
  assert.equal(missing.status, 404);
  const error = await missing.json();
  assertApiErrorResponse(error);
  assert.equal(error.error.code, "RESOURCE_NOT_FOUND");
  assert.equal(error.error.requestId, missing.headers.get("x-request-id"));
  const unsafeId = await fetch(`${baseUrl}/health`, {
    headers: { "x-request-id": "invalid value" },
  });
  assert.notEqual(unsafeId.headers.get("x-request-id"), "invalid value");
  const malformed = await fetch(`${baseUrl}/missing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"private":"unterminated',
  });
  assert.equal(malformed.status, 400);
  const malformedError = await malformed.json();
  assertApiErrorResponse(malformedError);
  assert.equal(malformedError.error.code, "INVALID_REQUEST");
  assert.ok(!JSON.stringify(malformedError).includes("unterminated"));
  const oversized = await fetch(`${baseUrl}/missing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(110000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "REQUEST_TOO_LARGE");
});

test("compiled worker starts without pretending to process jobs", async (t) => {
  const baseUrl = await startApplication(t, "worker", path.resolve("apps/worker/dist/main.js"));
  assert.deepEqual(await (await fetch(`${baseUrl}/health`)).json(), {
    status: "ok",
    service: "worker",
  });
  const missing = await fetch(`${baseUrl}/not-a-worker-route`);
  assert.equal(missing.status, 404);
  assertApiErrorResponse(await missing.json());
});

test("production web startup renders branding without fabricated operational data", async (t) => {
  const entry = path.resolve("apps/web/node_modules/next/dist/bin/next");
  const baseUrl = await startApplication(t, "web", entry, ["start", "--hostname", "127.0.0.1"]);
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /AIRMECH ONE/);
  assert.match(html, /Built by Qeilvra/);
  assert.match(html, /Operational workflows are not enabled yet/);
});
