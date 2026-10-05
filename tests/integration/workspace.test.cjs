const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("all five shared packages resolve to workspace artifacts", () => {
  for (const name of ["config", "contracts", "database", "testing", "ui"]) {
    const resolved = fs.realpathSync(require.resolve(`@airmech/${name}`));
    assert.equal(
      path.dirname(path.dirname(resolved)),
      fs.realpathSync(path.join(__dirname, "../../packages", name)),
    );
  }
});

test("API error envelopes contain safe correlation data across shared packages", () => {
  const { createApiErrorResponse } = require("@airmech/contracts");
  const { assertApiErrorResponse } = require("@airmech/testing");
  const response = createApiErrorResponse(
    "PERMISSION_DENIED",
    "You do not have permission to perform this action.",
    "req_foundation",
  );
  assertApiErrorResponse(response);
  assert.equal(response.error.code, "PERMISSION_DENIED");
  assert.equal(response.error.fieldErrors, null);
  assert.throws(() => assertApiErrorResponse({ error: { stack: "unsafe", code: "X" } }));
  for (const fieldErrors of [[], { name: "invalid" }, { name: [42] }]) {
    assert.throws(() => assertApiErrorResponse({ error: { ...response.error, fieldErrors } }));
  }
});

test("liveness contracts do not claim dependency readiness", () => {
  const { createHealthResponse } = require("@airmech/contracts");
  assert.deepEqual(createHealthResponse("api"), { status: "ok", service: "api" });
  assert.deepEqual(createHealthResponse("worker"), { status: "ok", service: "worker" });
});
