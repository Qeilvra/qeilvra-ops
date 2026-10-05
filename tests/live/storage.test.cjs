const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");

const {
  loadEnvironment,
  readServerConfiguration,
} = require("../../packages/config/dist/server.js");
const { StorageService } = require("../../packages/storage/dist/index.js");

test(
  "live Supabase private storage uploads, denies anonymous access, signs, retrieves and cleans up",
  { timeout: 120_000 },
  async (t) => {
    const environment = loadEnvironment();
    const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STORAGE_BUCKET"];
    const missing = required.filter((setting) => environment[setting] === undefined);
    if (missing.length > 0) {
      t.skip(
        `BLOCKED: configure ${missing.join(", ")} for a pre-existing private verification bucket.`,
      );
      return;
    }
    const configuration = readServerConfiguration("api", {
      NODE_ENV: "test",
      STORAGE_ENABLED: "true",
      SUPABASE_URL: environment.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: environment.SUPABASE_SERVICE_ROLE_KEY,
      STORAGE_BUCKET: environment.STORAGE_BUCKET,
      SUPABASE_ANON_KEY: environment.SUPABASE_ANON_KEY,
    });
    const reference = {
      ownerId: "infrastructure-verification",
      entityType: "system-healthcheck",
      entityId: randomUUID(),
    };
    const actorId = "infrastructure-verification";
    const service = new StorageService(configuration.storage, {
      authorize: (request) =>
        request.actorId === actorId &&
        request.object.entityId === reference.entityId &&
        request.object.entityType === reference.entityType &&
        request.object.ownerId === reference.ownerId,
    });
    await service.verifyPrivateBucket();
    const body = Buffer.from("Airmech One harmless private-storage verification.\n", "utf8");
    let stored;
    try {
      stored = await service.upload({
        ...reference,
        actorId,
        filename: "healthcheck.txt",
        mimeType: "text/plain",
        size: body.length,
        body,
      });
      const uploaded = await service.metadata(actorId, stored.object);
      assert.equal(uploaded.size, body.length);
      const unsigned = `${configuration.storage.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(configuration.storage.bucket)}/${stored.object.key}`;
      const anonymous = await fetch(unsigned, {
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
      assert.equal(
        anonymous.ok,
        false,
        "Private test file must reject an unsigned public-route request.",
      );
      await anonymous.body?.cancel();
      const authenticatedRoute = `${configuration.storage.supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(configuration.storage.bucket)}/${stored.object.key}`;
      const anonKey = configuration.storage.anonKey;
      const unprivileged = await fetch(authenticatedRoute, {
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
        // Publishable keys are application API keys, not user JWTs.
        headers: anonKey ? { apikey: anonKey } : {},
      });
      assert.equal(
        unprivileged.ok,
        false,
        "An anonymous actor must not read the private test object.",
      );
      await unprivileged.body?.cancel();
      const signedUrl = await service.getSignedDownloadUrl(actorId, stored.object, 60);
      const signed = await fetch(signedUrl, {
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
      assert.equal(signed.ok, true, "Authorized signed access must succeed.");
      assert.deepEqual(Buffer.from(await signed.arrayBuffer()), body);
      const metadata = await service.metadata(actorId, stored.object);
      assert.equal(metadata.size, body.length);
      assert.equal(metadata.mimeType, "text/plain");
      const expiringUrl = await service.getSignedDownloadUrl(actorId, stored.object, 1);
      await delay(2_100);
      const expired = await fetch(expiringUrl, {
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
        headers: { "cache-control": "no-cache" },
      });
      assert.equal(expired.ok, false, "Expired signed access must be denied.");
      await expired.body?.cancel();
    } finally {
      if (stored) {
        await service.delete(actorId, stored.object);
        await assert.rejects(service.metadata(actorId, stored.object), (error) => {
          return error.code === "STORAGE_PROVIDER_FAILURE" && [400, 404].includes(error.status);
        });
        // Supabase versions may return HTTP 400 for missing metadata. Independently
        // confirm that the unique verification prefix contains no objects.
        const listing = await fetch(
          `${configuration.storage.supabaseUrl}/storage/v1/object/list/${encodeURIComponent(configuration.storage.bucket)}`,
          {
            method: "POST",
            signal: AbortSignal.timeout(15_000),
            redirect: "error",
            headers: {
              apikey: configuration.storage.serviceRoleKey,
              authorization: `Bearer ${configuration.storage.serviceRoleKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              prefix: stored.object.key.slice(0, stored.object.key.lastIndexOf("/")),
              limit: 2,
            }),
          },
        );
        assert.equal(listing.ok, true, "Cleanup verification must succeed.");
        assert.deepEqual(await listing.json(), [], "No temporary object may remain.");
      }
    }
  },
);
