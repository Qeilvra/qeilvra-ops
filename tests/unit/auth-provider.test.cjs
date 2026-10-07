const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { readServerConfiguration } = require("@airmech/config/server");
const { SupabaseAuthProvider } = require("@airmech/identity");

async function withProvider(operation) {
  const calls = [];
  const identityId = randomUUID();
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      calls.push({ path: request.url, method: request.method, body, key: request.headers.apikey });
      if (body.password === "invalid") {
        response.writeHead(400);
        response.end(JSON.stringify({ message: "fake-private-provider-error" }));
        return;
      }
      if (body.password === "oversized") {
        response.writeHead(200);
        response.end(JSON.stringify({ value: "x".repeat(70_000) }));
        return;
      }
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/auth/v1/user" && request.method === "GET") {
        const token = request.headers.authorization;
        if (!["Bearer fake-invite-session", "Bearer fake-unconfirmed-session"].includes(token)) {
          response.writeHead(401);
          response.end("{}");
          return;
        }
        response.end(
          JSON.stringify({
            id: identityId,
            email: "test@example.invalid",
            email_confirmed_at:
              token === "Bearer fake-invite-session" ? "2026-10-07T12:00:00Z" : null,
          }),
        );
        return;
      }
      if (request.url.startsWith("/auth/v1/recover") || request.url === "/auth/v1/user")
        response.end("{}");
      else
        response.end(
          JSON.stringify({
            user: { id: identityId, email: "test@example.invalid" },
            access_token: "fake-transient-access-token",
          }),
        );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const config = readServerConfiguration("api", {
      SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
      SUPABASE_ANON_KEY: "fake-public-key",
      SUPABASE_SERVICE_ROLE_KEY: "fake-server-key",
    });
    await operation(new SupabaseAuthProvider(config), calls, identityId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("native provider adapter uses documented password/PKCE/recovery operations without sending server authority to login", () =>
  withProvider(async (provider, calls, identityId) => {
    assert.equal(
      (await provider.signIn("test@example.invalid", "test-only-password")).identityId,
      identityId,
    );
    await provider.requestRecovery(
      "test@example.invalid",
      "fake-pkce-challenge",
      "http://localhost:3000/auth/callback",
    );
    await provider.exchangeRecovery("fake-code", "fake-verifier");
    await provider.updatePassword("fake-recovery-access", "test-only-new-password");
    assert.ok(calls.every((call) => call.key === "fake-public-key"));
    assert.equal(calls[1].body.code_challenge_method, "s256");
    assert.equal(
      new URL(calls[1].path, "http://localhost").searchParams.get("redirect_to"),
      "http://localhost:3000/auth/callback",
    );
    assert.equal(calls[2].body.auth_code, "fake-code");
    assert.equal(calls[3].method, "PUT");
  }));

test("default invitation sessions require provider validation and a confirmed email", () =>
  withProvider(async (provider, calls, identityId) => {
    assert.equal(
      (await provider.verifyInvitationSession("fake-invite-session")).identityId,
      identityId,
    );
    for (const token of ["fake-unconfirmed-session", "expired-session", "", "x".repeat(16_385)])
      await assert.rejects(provider.verifyInvitationSession(token));
    assert.ok(calls.every((call) => call.method === "GET" && call.key === "fake-public-key"));
  }));

test("provider errors/oversized responses are bounded and redact submitted passwords and raw provider text", () =>
  withProvider(async (provider) => {
    for (const [password, code] of [
      ["invalid", "INVALID_CREDENTIALS"],
      ["oversized", "PROVIDER_UNAVAILABLE"],
    ])
      await assert.rejects(provider.signIn("test@example.invalid", password), (error) => {
        assert.equal(error.code, code);
        assert.equal(
          `${error.stack} ${JSON.stringify(error)}`.includes("fake-private-provider-error"),
          false,
        );
        assert.equal("cause" in error, false);
        return true;
      });
  }));
