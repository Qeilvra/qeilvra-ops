const test = require("node:test");
const assert = require("node:assert/strict");
const filterModule = import("../../apps/api/dist/common/filters/safe-http-exception.filter.js");
const { assertApiErrorResponse } = require("@airmech/testing");

test("unexpected exceptions never expose raw messages, SQL, paths, or stacks", async () => {
  const { SafeHttpExceptionFilter } = await filterModule;
  const reported = [];
  const headers = {};
  let body;
  const response = {
    headersSent: false,
    setHeader(name, value) {
      headers[name] = value;
    },
    end(value) {
      body = JSON.parse(value);
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: "req_safe_boundary" }),
      getResponse: () => response,
    }),
  };
  const filter = new SafeHttpExceptionFilter((event) => reported.push(event));
  filter.catch(new Error("SELECT credentials FROM secret C:\\internal\\private"), host);
  assert.equal(response.statusCode, 500);
  assertApiErrorResponse(body);
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(body.error.requestId, headers["X-Request-Id"]);
  assert.equal(reported.length, 1);
  const serialized = JSON.stringify({ body, reported });
  for (const privateText of ["SELECT", "credentials", "secret", "private", "stack"]) {
    assert.ok(!serialized.includes(privateText));
  }
});

test("an exception after headers are sent stops the response instead of leaking details", async () => {
  const { SafeHttpExceptionFilter } = await filterModule;
  let destroyed = false;
  const response = {
    headersSent: true,
    destroy() {
      destroyed = true;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: "req_headers_sent" }),
      getResponse: () => response,
    }),
  };
  new SafeHttpExceptionFilter(() => {}).catch(new Error("private detail"), host);
  assert.equal(destroyed, true);
});
