import { strict as assert } from "node:assert";
import type { ApiErrorResponse } from "@airmech/contracts";

const operatingSystemKeys = new Set([
  "SYSTEMROOT",
  "WINDIR",
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "LANG",
  "LC_ALL",
  "TZ",
]);

/** Copies only explicitly supplied OS essentials, never secrets or Node flags. */
export function createTestEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
  source: Readonly<Record<string, string | undefined>> = {},
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (operatingSystemKeys.has(key.toUpperCase()) && typeof value === "string") {
      environment[key] = value;
    }
  }
  environment.NODE_ENV = "test";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete environment[key];
    else environment[key] = value;
  }
  return environment;
}

/** Verifies transport shape without letting a test accidentally accept a raw exception. */
export function assertApiErrorResponse(value: unknown): asserts value is ApiErrorResponse {
  assert.ok(typeof value === "object" && value !== null && "error" in value);
  const error = (value as { error: unknown }).error;
  assert.ok(typeof error === "object" && error !== null);
  const fields = error as Record<string, unknown>;
  assert.equal(typeof fields.code, "string");
  assert.equal(typeof fields.message, "string");
  assert.equal(typeof fields.requestId, "string");
  assert.ok((fields.requestId as string).length > 0);
  if (fields.fieldErrors !== null) {
    assert.ok(typeof fields.fieldErrors === "object" && !Array.isArray(fields.fieldErrors));
    for (const messages of Object.values(fields.fieldErrors as Record<string, unknown>)) {
      assert.ok(
        Array.isArray(messages) &&
          messages.every((message: unknown) => typeof message === "string"),
      );
    }
  }
  assert.ok(!("stack" in fields));
}
