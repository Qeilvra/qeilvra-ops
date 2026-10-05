const test = require("node:test");
const assert = require("node:assert/strict");
const { ConfigurationError, readRuntimeSettings } = require("@airmech/config");

const defaults = { host: "127.0.0.1", port: 3001 };

test("process defaults stay on loopback and preserve development mode", () => {
  assert.deepEqual(readRuntimeSettings({}, defaults), { ...defaults, environment: "development" });
});

test("valid process environment overrides are explicit", () => {
  assert.deepEqual(
    readRuntimeSettings({ HOST: "::1", PORT: "65535", NODE_ENV: "production" }, defaults),
    {
      host: "::1",
      port: 65535,
      environment: "production",
    },
  );
});

test("invalid ports fail before binding rather than truncating input", () => {
  for (const port of ["", "0", "65536", "3001junk", " 3001", "1.5", "-1", "NaN"]) {
    assert.throws(
      () => readRuntimeSettings({ PORT: port }, defaults),
      (error) => {
        assert.ok(error instanceof ConfigurationError);
        assert.equal(error.setting, "PORT");
        assert.ok(!error.message.includes(port) || port === "");
        return true;
      },
    );
  }
});

test("invalid environments and hosts fail without echoing untrusted values", () => {
  for (const [name, value] of [
    ["NODE_ENV", "sensitive-value"],
    ["HOST", "https://private-value.invalid"],
    ["HOST", ""],
  ]) {
    assert.throws(
      () => readRuntimeSettings({ [name]: value }, defaults),
      (error) => {
        assert.equal(error.setting, name);
        if (value) assert.ok(!error.message.includes(value));
        return true;
      },
    );
  }
});
