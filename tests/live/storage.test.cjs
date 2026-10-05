const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");

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
        headers: anonKey ? { apikey: anonKey, authorization: `Bearer ${anonKey}` } : {},
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
    } finally {
      if (stored) await service.delete(actorId, stored.object);
    }
  },
);
