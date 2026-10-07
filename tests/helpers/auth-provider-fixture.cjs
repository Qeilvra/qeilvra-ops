const http = require("node:http");
const { createHash, randomUUID, randomBytes } = require("node:crypto");

/** Controlled HTTP implementation of the documented provider protocol, never a live identity store. */
async function startAuthProviderFixture() {
  const accounts = new Map(),
    access = new Map(),
    recoveries = new Map(),
    invitations = new Map();
  const state = {
    recoveryCalls: 0,
    recoveryFailures: 0,
    pauseRecovery: false,
    pausePassword: false,
    recoveryStarted: false,
    passwordStarted: false,
    passwordFailures: 0,
    pauseProvision: false,
    provisionStarted: false,
  };
  let releaseRecovery, releasePassword;
  let releaseProvision;
  const provisionGate = new Promise((resolve) => {
    releaseProvision = resolve;
  });
  const recoveryGate = new Promise((resolve) => {
    releaseRecovery = resolve;
  });
  let passwordGate = new Promise((resolve) => {
    releasePassword = resolve;
  });
  function account(email, password = null) {
    const value = { id: randomUUID(), email, password, emailConfirmed: password !== null };
    accounts.set(email, value);
    return value;
  }
  function session(user) {
    const token = randomBytes(32).toString("base64url");
    access.set(token, user);
    return { user: { id: user.id, email: user.email }, access_token: token };
  }
  async function handle(request, response) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    const url = new URL(request.url, "http://localhost");
    const admin = url.pathname.includes("/admin/") || url.pathname.endsWith("/invite");
    if (request.headers.apikey !== (admin ? "fixture-server-key" : "fixture-public-key")) {
      response.statusCode = 403;
      response.end("{}");
      return;
    }
    response.setHeader("Content-Type", "application/json");
    const fail = () => {
      response.statusCode = 400;
      response.end(JSON.stringify({ msg: "Fixture denied this operation" }));
    };
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const user = accounts.get(body.email);
      if (!user || user.password !== body.password || !body.password) {
        fail();
        return;
      }
      response.end(JSON.stringify(session(user)));
      return;
    }
    if (url.pathname === "/auth/v1/admin/users") {
      if (accounts.has(body.email)) {
        fail();
        return;
      }
      const user = account(body.email, body.password ?? null);
      user.metadata = body.user_metadata;
      state.provisionStarted = true;
      if (state.pauseProvision) await provisionGate;
      response.end(JSON.stringify({ id: user.id, email: user.email }));
      return;
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/") && request.method === "GET") {
      const id = url.pathname.split("/").at(-1);
      const user = [...accounts.values()].find((item) => item.id === id);
      if (!user) {
        response.statusCode = 404;
        response.end("{}");
        return;
      }
      response.end(
        JSON.stringify({
          id: user.id,
          email: user.email,
          email_confirmed_at: user.emailConfirmed ? new Date().toISOString() : null,
          user_metadata: user.metadata ?? {},
        }),
      );
      return;
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/") && request.method === "DELETE") {
      const id = url.pathname.split("/").at(-1);
      const user = [...accounts.values()].find((item) => item.id === id);
      if (!user) {
        response.statusCode = 404;
        response.end("{}");
        return;
      }
      accounts.delete(user.email);
      response.end("{}");
      return;
    }
    if (url.pathname === "/auth/v1/recover") {
      state.recoveryCalls++;
      state.recoveryStarted = true;
      if (state.pauseRecovery) await recoveryGate;
      if (state.recoveryFailures > 0) {
        state.recoveryFailures--;
        response.statusCode = 503;
        response.end("{}");
        return;
      }
      const user = accounts.get(body.email);
      if (user)
        recoveries.set(randomUUID(), {
          user,
          challenge: body.code_challenge,
          used: false,
          expiresAt: Date.now() + 600000,
        });
      response.end("{}");
      return;
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
      const recovery = recoveries.get(body.auth_code);
      if (
        !recovery ||
        recovery.used ||
        recovery.expiresAt < Date.now() ||
        createHash("sha256").update(body.code_verifier).digest("base64url") !== recovery.challenge
      ) {
        fail();
        return;
      }
      recovery.used = true;
      response.end(JSON.stringify(session(recovery.user)));
      return;
    }
    if (url.pathname === "/auth/v1/invite") {
      const user = accounts.get(body.email);
      if (!user) {
        fail();
        return;
      }
      if (user.emailConfirmed) {
        response.statusCode = 422;
        response.end("{}");
        return;
      }
      const hash = randomBytes(32).toString("hex");
      for (const invite of invitations.values()) if (invite.user.id === user.id) invite.used = true;
      invitations.set(hash, { user, used: false, expiresAt: Date.now() + 600000 });
      response.end(JSON.stringify({ id: user.id, email: user.email }));
      return;
    }
    if (url.pathname === "/auth/v1/verify") {
      if (body.type === "recovery") {
        const recovery = recoveries.get(body.token_hash);
        if (!recovery || recovery.used || recovery.challenge || recovery.expiresAt <= Date.now()) {
          fail();
          return;
        }
        recovery.used = true;
        response.end(JSON.stringify(session(recovery.user)));
        return;
      }
      const invite = invitations.get(body.token_hash);
      if (body.type !== "invite" || !invite || invite.used || invite.expiresAt <= Date.now()) {
        fail();
        return;
      }
      invite.used = true;
      invite.user.emailConfirmed = true;
      response.end(JSON.stringify(session(invite.user)));
      return;
    }
    if (url.pathname === "/auth/v1/user" && request.method === "GET") {
      const user = access.get(request.headers.authorization?.replace(/^Bearer /, ""));
      if (!user) {
        fail();
        return;
      }
      response.end(
        JSON.stringify({
          id: user.id,
          email: user.email,
          email_confirmed_at: user.emailConfirmed ? new Date().toISOString() : null,
        }),
      );
      return;
    }
    if (url.pathname === "/auth/v1/user" && request.method === "PUT") {
      const user = access.get(request.headers.authorization?.replace(/^Bearer /, ""));
      if (!user) {
        fail();
        return;
      }
      state.passwordStarted = true;
      if (state.pausePassword) await passwordGate;
      if (state.passwordFailures > 0) {
        state.passwordFailures--;
        response.statusCode = 503;
        response.end("{}");
        return;
      }
      user.password = body.password;
      response.end(JSON.stringify({ id: user.id, email: user.email }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  }
  const server = http.createServer((request, response) => {
    handle(request, response).catch(() => {
      response.statusCode = 500;
      response.end("{}");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    accounts,
    recoveries,
    invitations,
    state,
    account,
    releaseRecovery,
    releaseProvision,
    releasePassword: () => releasePassword(),
    holdPassword: () => {
      state.pausePassword = true;
      state.passwordStarted = false;
      passwordGate = new Promise((resolve) => {
        releasePassword = resolve;
      });
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
module.exports = { startAuthProviderFixture };
