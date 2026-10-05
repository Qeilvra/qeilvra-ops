const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("node:net");
const { performance } = require("node:perf_hooks");
const test = require("node:test");
const { setTimeout } = require("node:timers");

const { ConfigurationError, readServerConfiguration } = require("@airmech/config/server");
const {
  QueueInfrastructureError,
  REDIS_MAX_RECONNECT_ATTEMPTS,
  SYSTEM_HEALTHCHECK_JOB,
  SystemQueueProducer,
  processSystemJob,
  redisConnectionOptions,
  startSystemQueueWorker,
  systemJobId,
  systemJobOptions,
} = require("../../packages/queue/dist/index.js");

async function unusedRedisConfiguration() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address();
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return readServerConfiguration("api", {
    NODE_ENV: "test",
    REDIS_ENABLED: "true",
    REDIS_URL: `redis://127.0.0.1:${port}/0`,
  }).redis;
}

test("queue config remains disabled without network activity and requires validated Redis settings", async () => {
  const config = readServerConfiguration("api", {}).redis;
  const producer = new SystemQueueProducer(config);
  await assert.rejects(
    producer.enqueueHealthcheck("unit-disabled"),
    (error) => error.code === "QUEUE_DISABLED",
  );
  await producer.close();
  assert.throws(() => new SystemQueueProducer({ enabled: true, url: null }), ConfigurationError);
});

test("producer construction is lazy and shutdown is idempotent", async () => {
  const configuration = await unusedRedisConfiguration();
  const events = [];
  const producer = new SystemQueueProducer(configuration, {
    onEvent: (event) => events.push(event),
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(events, []);
  const privateConfiguration = readServerConfiguration("api", {
    REDIS_ENABLED: "true",
    REDIS_URL: "redis://unit:fake-private-token@127.0.0.1:6379/0",
  }).redis;
  const privateProducer = new SystemQueueProducer(privateConfiguration);
  assert.equal(JSON.stringify(privateProducer).includes("fake-private-token"), false);
  assert.equal(JSON.stringify(privateProducer).includes("redis://"), false);
  await privateProducer.close();
  const firstClose = producer.close();
  assert.equal(producer.close(), firstClose);
  await firstClose;
  await assert.rejects(
    producer.enqueueHealthcheck("unit-closed"),
    (error) => error.code === "QUEUE_CLOSED",
  );
});

test("queue policy limits attempts, backs off, keeps bounded failure history and hashes idempotency keys", () => {
  const options = systemJobOptions("request-id_123");
  assert.equal(options.attempts, 3);
  assert.deepEqual(options.backoff, { type: "exponential", delay: 250 });
  assert.deepEqual(options.removeOnComplete, { age: 3_600, count: 1_000 });
  assert.deepEqual(options.removeOnFail, { age: 604_800, count: 5_000 });
  assert.equal(options.stackTraceLimit, 0);
  assert.equal(options.jobId, systemJobId("request-id_123"));
  assert.notEqual(options.jobId, systemJobId("request-id_456"));
  assert.match(options.jobId, /^system-healthcheck-[a-f0-9]{64}$/);
  for (const invalid of ["", "../unsafe", "private:token", "id with spaces", "x".repeat(129), 42]) {
    assert.throws(() => systemJobId(invalid), QueueInfrastructureError);
  }
});

test("worker and producer connection policies bound reconnection and keep blocking commands worker-only", () => {
  const producer = redisConnectionOptions("producer");
  const worker = redisConnectionOptions("worker");
  assert.equal(producer.maxRetriesPerRequest, 1);
  assert.equal(producer.enableOfflineQueue, false);
  assert.equal(producer.commandTimeout, 3_000);
  assert.equal(worker.maxRetriesPerRequest, null);
  assert.equal(worker.enableOfflineQueue, true);
  assert.equal(worker.commandTimeout, undefined);
  for (const options of [producer, worker]) {
    assert.equal(options.connectTimeout, 3_000);
    assert.ok(options.retryStrategy(1) > 0);
    assert.ok(options.retryStrategy(REDIS_MAX_RECONNECT_ATTEMPTS) <= 1_000);
    assert.equal(options.retryStrategy(REDIS_MAX_RECONNECT_ATTEMPTS + 1), null);
  }
});

test("system processor accepts only infrastructure healthchecks and permanently rejects malformed jobs", async () => {
  const result = await processSystemJob({
    name: SYSTEM_HEALTHCHECK_JOB,
    data: { requestId: "unit-healthcheck" },
  });
  assert.equal(result.status, "ok");
  assert.equal(result.requestId, "unit-healthcheck");
  assert.ok(Number.isFinite(Date.parse(result.processedAt)));
  for (const job of [
    { name: "email.send", data: { requestId: "unit-healthcheck" } },
    { name: SYSTEM_HEALTHCHECK_JOB, data: null },
    { name: SYSTEM_HEALTHCHECK_JOB, data: { requestId: "unsafe/private" } },
    { name: SYSTEM_HEALTHCHECK_JOB, data: {} },
  ]) {
    await assert.rejects(processSystemJob(job), (error) => {
      assert.equal(error.name, "UnrecoverableError");
      assert.equal(error.message.includes("unsafe/private"), false);
      return true;
    });
  }
});

test("worker sanitizes provider errors before BullMQ records failures", async () => {
  const sentinel = "fake-private-token-never-log";
  await assert.rejects(
    processSystemJob(
      { name: SYSTEM_HEALTHCHECK_JOB, data: { requestId: "unit-failure" } },
      async () => {
        throw new Error(sentinel);
      },
    ),
    (error) => !`${error.message}\n${error.stack}\n${JSON.stringify(error)}`.includes(sentinel),
  );
});

test(
  "producer reports unavailable Redis within a bounded interval without leaking provider errors",
  { timeout: 12_000 },
  async (t) => {
    const events = [];
    const producer = new SystemQueueProducer(await unusedRedisConfiguration(), {
      onEvent: (event) => events.push(event),
    });
    t.after(() => producer.close());
    const started = performance.now();
    await assert.rejects(producer.enqueueHealthcheck("unit-unavailable"), (error) => {
      assert.ok(error instanceof QueueInfrastructureError);
      assert.equal(error.code, "QUEUE_UNAVAILABLE");
      assert.equal("cause" in error, false);
      assert.equal(error.message.includes("127.0.0.1"), false);
      return true;
    });
    assert.ok(performance.now() - started < 8_000);
    assert.ok(events.some((event) => event.event === "queue_unavailable"));
    assert.equal(JSON.stringify(events).includes("redis://"), false);
  },
);

test(
  "worker reports Redis failure and stops its processing loop after finite retries",
  { timeout: 15_000 },
  async (t) => {
    const events = [];
    let unavailableCalls = 0;
    const worker = startSystemQueueWorker(await unusedRedisConfiguration(), {
      onEvent: (event) => events.push(event),
      onUnavailable: () => {
        unavailableCalls += 1;
      },
    });
    t.after(() => worker.close());
    await assert.rejects(worker.ready(), (error) => error.code === "QUEUE_UNAVAILABLE");
    await worker.close();
    assert.equal(unavailableCalls, 1);
    assert.ok(events.some((event) => event.event === "queue_unavailable"));
    assert.equal(JSON.stringify(events).includes("redis://"), false);
  },
);
