const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const test = require("node:test");

const { readServerConfiguration } = require("../../packages/config/dist/server.js");
const {
  MAX_FILE_SIZE,
  StorageError,
  StorageService,
} = require("../../packages/storage/dist/index.js");

const reference = Object.freeze({ ownerId: "system", entityType: "healthcheck", entityId: "unit" });
const body = Buffer.from("Harmless infrastructure test.\n", "utf8");
const object = Object.freeze({
  ...reference,
  key: "healthcheck/unit/system/10000000-0000-4000-8000-000000000000.txt",
});
const upload = Object.freeze({
  ...reference,
  actorId: "test",
  filename: "check.txt",
  mimeType: "text/plain",
  size: body.length,
  body,
});

function settings(url) {
  return readServerConfiguration("api", {
    STORAGE_ENABLED: "true",
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: "unit-private-key",
    STORAGE_BUCKET: "private",
  }).storage;
}

function code(expected) {
  return (error) => error instanceof StorageError && error.code === expected && !("cause" in error);
}

async function fixture(t, options = {}) {
  const calls = [];
  const files = new Map();
  let isPrivate = true;
  const server = createServer((request, response) => {
    const processRequest = async () => {
      const route = request.url.slice("/storage/v1".length);
      calls.push({ method: request.method, route, headers: request.headers });
      if (options.handler?.(request, response, route)) return;
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const content = Buffer.concat(chunks);
      response.setHeader("content-type", "application/json");
      if (route === "/bucket/private") {
        response.end(JSON.stringify({ id: "private", public: !isPrivate }));
      } else if (request.method === "POST" && route.startsWith("/object/sign/private/")) {
        response.end(JSON.stringify({ signedURL: `${route}?token=unit-signed-token` }));
      } else if (request.method === "POST" && route.startsWith("/object/private/")) {
        const key = route.slice("/object/private/".length);
        files.set(key, content);
        response.end(JSON.stringify({ Id: "unit", Key: `private/${key}` }));
      } else if (request.method === "GET" && route.startsWith("/object/info/private/")) {
        const key = route.slice("/object/info/private/".length);
        response.end(
          JSON.stringify({ size: files.get(key)?.length ?? 0, content_type: "text/plain" }),
        );
      } else if (request.method === "DELETE" && route === "/object/private") {
        for (const key of JSON.parse(content.toString("utf8")).prefixes) files.delete(key);
        response.end("[]");
      } else {
        response.statusCode = 404;
        response.end("{}");
      }
    };
    processRequest().catch(() => {
      response.destroy();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  return {
    calls,
    files,
    configuration: settings(`http://127.0.0.1:${server.address().port}`),
    setPrivate: (value) => {
      isPrivate = value;
    },
  };
}

test("storage loads validated server configuration without I/O or serializable credentials", async () => {
  const disabled = new StorageService(readServerConfiguration("api", {}).storage);
  assert.equal(JSON.stringify(disabled), "{}");
  await assert.rejects(disabled.verifyPrivateBucket(), code("STORAGE_DISABLED"));
  for (const url of [
    "http://storage.example.invalid",
    "https://storage.example.invalid/unsafe",
    "https://storage.example.invalid?key=secret",
  ]) {
    assert.throws(() => new StorageService(settings(url)), code("INVALID_STORAGE_CONFIGURATION"));
  }
  assert.throws(
    () =>
      new StorageService({ ...settings("https://storage.example.invalid"), serviceRoleKey: null }),
    code("INVALID_STORAGE_CONFIGURATION"),
  );
});

test("storage denies every file operation by default before sending credentials", async (t) => {
  const f = await fixture(t);
  const service = new StorageService(f.configuration);
  await assert.rejects(service.upload(upload), code("STORAGE_FORBIDDEN"));
  await assert.rejects(service.getSignedDownloadUrl("test", object), code("STORAGE_FORBIDDEN"));
  await assert.rejects(service.metadata("test", object), code("STORAGE_FORBIDDEN"));
  await assert.rejects(service.delete("test", object), code("STORAGE_FORBIDDEN"));
  assert.equal(f.calls.length, 0);
  const throwing = new StorageService(f.configuration, {
    authorize() {
      throw new Error("unit-private-key");
    },
  });
  await assert.rejects(
    throwing.delete("test", object),
    (error) => code("STORAGE_FORBIDDEN")(error) && !error.stack.includes("unit-private-key"),
  );
});

test("private upload streams bytes, generates an entity key, signs, reads metadata and deletes", async (t) => {
  const f = await fixture(t);
  const authorization = [];
  const service = new StorageService(f.configuration, {
    authorize(request) {
      authorization.push(request);
      return request.actorId === "test";
    },
  });
  async function* chunks() {
    yield body.subarray(0, 3);
    yield body.subarray(3, 6);
    yield body.subarray(6);
  }
  const result = await service.upload({
    ...upload,
    filename: "untrusted name.txt",
    body: chunks(),
  });
  assert.match(result.object.key, /^healthcheck\/unit\/system\/[0-9a-f-]{36}\.txt$/);
  assert.equal(result.object.key.includes("untrusted"), false);
  assert.deepEqual(f.files.get(result.object.key), body);
  assert.ok(Object.isFrozen(result.object));
  assert.equal(
    await service.getSignedDownloadUrl("test", result.object, 300),
    `${f.configuration.supabaseUrl}/storage/v1/object/sign/private/${result.object.key}?token=unit-signed-token`,
  );
  assert.deepEqual(await service.metadata("test", result.object), result);
  await service.delete("test", result.object);
  assert.equal(f.files.size, 0);
  assert.deepEqual(
    authorization.map((value) => value.action),
    ["upload", "download", "metadata", "delete"],
  );
  assert.ok(
    authorization.every((value) => Object.isFrozen(value) && value.object.ownerId === "system"),
  );
  const request = f.calls.find(
    (value) => value.method === "POST" && value.route.startsWith("/object/private/"),
  );
  assert.equal(request.headers["x-upsert"], "false");
  assert.deepEqual(
    JSON.parse(Buffer.from(request.headers["x-metadata"], "base64").toString("utf8")),
    reference,
  );
  assert.equal(f.calls.filter((value) => value.route === "/bucket/private").length, 4);
});

test("storage rejects public buckets before upload or URL signing", async (t) => {
  const f = await fixture(t);
  f.setPrivate(false);
  const service = new StorageService(f.configuration, { authorize: () => true });
  await assert.rejects(service.upload(upload), code("STORAGE_BUCKET_NOT_PRIVATE"));
  await assert.rejects(
    service.getSignedDownloadUrl("test", object),
    code("STORAGE_BUCKET_NOT_PRIVATE"),
  );
  assert.ok(f.calls.every((value) => value.route === "/bucket/private"));
});

test("storage rejects filename paths, type mismatches, oversized files, and unsafe references", async (t) => {
  const f = await fixture(t);
  const service = new StorageService(f.configuration, { authorize: () => true });
  for (const change of [
    { filename: "../../check.txt" },
    { filename: "C:\\check.txt" },
    { filename: "x.html", mimeType: "text/html" },
    { mimeType: "toString" },
    { mimeType: "__proto__" },
    { filename: "txt" },
    { filename: "x.pdf" },
    { size: 0 },
    { size: MAX_FILE_SIZE + 1 },
    { size: body.length - 1 },
  ])
    await assert.rejects(service.upload({ ...upload, ...change }), code("INVALID_STORAGE_FILE"));
  for (const change of [
    { entityId: "../other" },
    { ownerId: "other/owner" },
    { key: "../check.txt" },
    { entityId: "other" },
  ]) {
    await assert.rejects(
      service.metadata("test", { ...object, ...change }),
      code("INVALID_STORAGE_REFERENCE"),
    );
  }
  for (const expiresIn of [0, 301, 1.5])
    await assert.rejects(
      service.getSignedDownloadUrl("test", object, expiresIn),
      code("INVALID_STORAGE_FILE"),
    );
  assert.equal(f.calls.length, 0);
});

test("storage enforces streamed byte count and MIME content signatures", async (t) => {
  const f = await fixture(t);
  const service = new StorageService(f.configuration, { authorize: () => true });
  async function* oversized() {
    yield body;
    yield Buffer.from("extra");
  }
  async function* undersized() {
    yield body.subarray(0, 3);
  }
  for (const stream of [oversized(), undersized()])
    await assert.rejects(service.upload({ ...upload, body: stream }), code("INVALID_STORAGE_FILE"));
  await assert.rejects(
    service.upload({ ...upload, filename: "x.pdf", mimeType: "application/pdf" }),
    code("INVALID_STORAGE_FILE"),
  );
  await assert.rejects(
    service.upload({ ...upload, body: Buffer.alloc(body.length) }),
    code("INVALID_STORAGE_FILE"),
  );
  const pdf = Buffer.from("%PDF-1.7\nHarmless test fixture.");
  const result = await service.upload({
    ...upload,
    filename: "x.pdf",
    mimeType: "application/pdf",
    body: pdf,
    size: pdf.length,
  });
  assert.deepEqual(f.files.get(result.object.key), pdf);
});

test("storage sanitizes provider and network errors, with bounded requests", async (t) => {
  const f = await fixture(t, {
    handler(_request, response) {
      response.statusCode = 503;
      response.end("unit-private-key provider failure");
      return true;
    },
  });
  const service = new StorageService(f.configuration);
  await assert.rejects(
    service.verifyPrivateBucket(),
    (error) =>
      code("STORAGE_UNAVAILABLE")(error) &&
      error.status === 503 &&
      !error.stack.includes("unit-private-key"),
  );
  const stalled = await fixture(t, {
    handler() {
      return true;
    },
  });
  await assert.rejects(
    new StorageService(stalled.configuration, { requestTimeoutMs: 50 }).verifyPrivateBucket(),
    code("STORAGE_UNAVAILABLE"),
  );
  const redirect = await fixture(t, {
    handler(_request, response) {
      response.statusCode = 302;
      response.setHeader("location", "http://other.example.invalid");
      response.end();
      return true;
    },
  });
  await assert.rejects(
    new StorageService(redirect.configuration).verifyPrivateBucket(),
    code("STORAGE_PROVIDER_FAILURE"),
  );
});

test("storage rejects hostile signed URLs and oversized provider responses", async (t) => {
  const f = await fixture(t, {
    handler(_request, response, route) {
      if (!route.startsWith("/object/sign")) return false;
      response.end(JSON.stringify({ signedURL: "//other.example.invalid/file?token=bad" }));
      return true;
    },
  });
  await assert.rejects(
    new StorageService(f.configuration, { authorize: () => true }).getSignedDownloadUrl(
      "test",
      object,
    ),
    code("INVALID_STORAGE_RESPONSE"),
  );
  const malformed = await fixture(t, {
    handler(_request, response, route) {
      if (!route.startsWith("/object/sign")) return false;
      response.end(JSON.stringify({ signedURL: "http://[invalid-host?token=unit-private-key" }));
      return true;
    },
  });
  await assert.rejects(
    new StorageService(malformed.configuration, { authorize: () => true }).getSignedDownloadUrl(
      "test",
      object,
    ),
    (error) => code("INVALID_STORAGE_RESPONSE")(error) && !error.stack.includes("unit-private-key"),
  );
  const large = await fixture(t, {
    handler(_request, response) {
      response.end(JSON.stringify({ value: "x".repeat(70_000) }));
      return true;
    },
  });
  await assert.rejects(
    new StorageService(large.configuration).verifyPrivateBucket(),
    code("INVALID_STORAGE_RESPONSE"),
  );
});
