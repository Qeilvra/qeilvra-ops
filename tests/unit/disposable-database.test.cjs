const assert = require("node:assert/strict");
const test = require("node:test");
const { assertDisposableDatabase } = require("../helpers/disposable-database.cjs");

const environment = { NODE_ENV: "test", INFRASTRUCTURE_TEST_DATABASE_MUTATIONS: "true" };
const local = {
  enabled: true,
  url: "postgresql://fixture@127.0.0.1:5432/fixture",
  migrationUrl: null,
};

test("mutation fixtures require explicit opt-in, test mode and enabled database", () => {
  assert.doesNotThrow(() => assertDisposableDatabase(local, environment));
  for (const input of [
    {},
    { ...environment, NODE_ENV: "development" },
    { ...environment, INFRASTRUCTURE_TEST_DATABASE_MUTATIONS: "false" },
  ]) {
    assert.throws(() => assertDisposableDatabase(local, input), /Mutation tests require/);
  }
  assert.throws(
    () => assertDisposableDatabase({ ...local, enabled: false }, environment),
    /Mutation tests require/,
  );
});

test("both runtime and migration endpoints must be loopback and errors never echo credentials", () => {
  const cloud = "postgresql://fixture:private-fixture-password@cloud.example/fixture";
  for (const input of [
    { ...local, url: cloud, migrationUrl: local.url },
    { ...local, migrationUrl: cloud },
    { ...local, url: "invalid-private-fixture-password" },
    { ...local, url: "https://127.0.0.1/fixture" },
  ]) {
    assert.throws(
      () => assertDisposableDatabase(input, environment),
      (error) =>
        error.message.startsWith("Mutation tests require") &&
        !error.message.includes("private-fixture-password"),
    );
  }
});
