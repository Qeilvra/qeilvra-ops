const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Never echo URLs, even when a caller supplies malformed credentials/configuration. */
function assertDisposableDatabase(configuration, environment = process.env) {
  let allowed =
    environment.NODE_ENV === "test" &&
    environment.INFRASTRUCTURE_TEST_DATABASE_MUTATIONS === "true" &&
    configuration.enabled;
  for (const value of [configuration.url, configuration.migrationUrl ?? configuration.url]) {
    try {
      const endpoint = new URL(value);
      allowed =
        allowed &&
        ["postgres:", "postgresql:"].includes(endpoint.protocol) &&
        loopback.has(endpoint.hostname);
    } catch {
      allowed = false;
    }
  }
  if (!allowed)
    throw new Error(
      "Mutation tests require test mode, explicit opt-in and loopback runtime/migration databases.",
    );
}

module.exports = { assertDisposableDatabase };
