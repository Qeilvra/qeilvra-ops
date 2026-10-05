const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const { createRequire } = require("node:module");
const { createServer } = require("node:net");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const test = require("node:test");
const { clearTimeout, setTimeout } = require("node:timers");

const { loadEnvironment, readServerConfiguration } = require("@airmech/config/server");
const {
  SYSTEM_HEALTHCHECK_JOB,
  SYSTEM_QUEUE_NAME,
  startSystemQueueWorker,
  systemJobId,
  systemJobOptions,
} = require("../../packages/queue/dist/index.js");
const queueRequire = createRequire(path.resolve(__dirname, "../../packages/queue/package.json"));
const { Queue } = queueRequire("bullmq");
const { Redis } = queueRequire("ioredis");

async function fixture(t, options = {}) {
  const configuration = readServerConfiguration("worker", loadEnvironment()).redis;
  assert.equal(
    configuration.enabled,
    true,
    "Live queue verification requires REDIS_ENABLED=true and REDIS_URL configured.",
  );
  const prefix = `airmech-verify-${randomUUID()}`;
  const connection = new Redis(configuration.url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
  });

  connection.on("error", () => undefined);
  const queue = new Queue(SYSTEM_QUEUE_NAME, { connection, prefix });
  queue.on("error", () => undefined);
  const { SystemQueueService } =
    await import("../../apps/api/dist/infrastructure/queue/system-queue.service.js");
  const producer = new SystemQueueService(configuration, { prefix, onEvent: () => undefined });
  const events = [];
  const worker = startSystemQueueWorker(configuration, {
    prefix,
    onEvent: (event) => events.push(event),
    ...options,
  });
  t.after(async () => {
    try {
      await worker.close();
      await producer.onApplicationShutdown();
      // Only this test's unique queue namespace is removed; never flush a shared Redis DB.
      await queue.obliterate({ force: true });
      assert.deepEqual(await connection.keys(`${prefix}:*`), []);
    } finally {
      await queue.close();
      connection.disconnect();
    }
  });
  await worker.ready();
  await queue.waitUntilReady();
  return { queue, producer, events };
}

async function waitForState(queue, jobId, expectedState) {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if ((await queue.getJobState(jobId)) === expectedState) {
      const job = await queue.getJob(jobId);
      if (job !== undefined) return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`The isolated infrastructure job did not reach ${expectedState} in time.`);
}

test(
  "live API producer sends a healthcheck to the worker and deduplicates a repeated idempotency key",
  { timeout: 30_000 },
  async (t) => {
    const { queue, producer, events } = await fixture(t);
    const requestId = `verify-${randomUUID()}`;
    const first = await producer.enqueueHealthcheck(requestId);
    const job = await waitForState(queue, first.jobId, "completed");
    assert.equal(job.returnvalue.status, "ok");
    assert.equal(job.returnvalue.requestId, requestId);
    assert.equal(job.attemptsMade, 1);
    const repeated = await producer.enqueueHealthcheck(requestId);
    assert.equal(repeated.jobId, first.jobId);
    assert.equal(await queue.getCompletedCount(), 1);
    assert.ok(
      events.some((event) => event.event === "job_completed" && event.jobId === first.jobId),
    );
  },
);

test(
  "live worker retries a transient infrastructure failure with configured backoff",
  { timeout: 30_000 },
  async (t) => {
    let processed = 0;
    const { queue, producer, events } = await fixture(t, {
      healthcheckProcessor: async (data) => {
        processed += 1;
        if (processed < 3) throw new Error("Simulated temporary infrastructure failure.");
        return { status: "ok", requestId: data.requestId, processedAt: new Date().toISOString() };
      },
    });
    const started = performance.now();
    const { jobId } = await producer.enqueueHealthcheck(`verify-${randomUUID()}`);
    const job = await waitForState(queue, jobId, "completed");
    assert.equal(job.attemptsMade, 3);
    assert.equal(processed, 3);
    assert.ok(performance.now() - started >= 700, "Exponential retry backoff must be observed.");
    assert.equal(events.filter((event) => event.event === "job_failed").length, 2);
  },
);

test(
  "live worker retains exhausted failures and permanently rejects invalid infrastructure jobs",
  { timeout: 30_000 },
  async (t) => {
    const { queue, producer } = await fixture(t, {
      healthcheckProcessor: async () => {
        throw new Error("fake-private-sentinel-never-persist");
      },
    });
    const { jobId } = await producer.enqueueHealthcheck(`verify-${randomUUID()}`);
    const failed = await waitForState(queue, jobId, "failed");
    assert.equal(failed.attemptsMade, 3);
    assert.equal(failed.failedReason.includes("fake-private-sentinel-never-persist"), false);
    assert.deepEqual(failed.stacktrace, []);
    assert.equal(await queue.getFailedCount(), 1);

    const invalidId = systemJobId(`invalid-${randomUUID()}`);
    await queue.add(
      SYSTEM_HEALTHCHECK_JOB,
      { requestId: "../invalid" },
      { ...systemJobOptions("invalid-payload"), jobId: invalidId },
    );
    const invalid = await waitForState(queue, invalidId, "failed");
    assert.equal(invalid.attemptsMade, 1);
    assert.match(invalid.failedReason, /invalid name or payload/);
    assert.equal(await queue.getFailedCount(), 2);
  },
);

test(
  "live compiled worker starts its consumer, processes an API job, and shuts down its owned process",
  { timeout: 30_000 },
  async (t) => {
    const configuration = readServerConfiguration("worker", loadEnvironment()).redis;
    assert.equal(
      configuration.enabled,
      true,
      "Compiled worker verification requires enabled Redis.",
    );
    const connection = new Redis(configuration.url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
    });
    connection.on("error", () => undefined);
    let queue;
    let testJobId;
    let producer;
    let child;
    let exited = false;
    let exitPromise;
    t.after(async () => {
      try {
        if (child !== undefined && !exited) {
          child.kill("SIGTERM");
          let shutdownTimer;
          const stopped = await Promise.race([
            exitPromise.then(() => true),
            new Promise((resolve) => {
              shutdownTimer = setTimeout(() => resolve(false), 5_000);
            }),
          ]).finally(() => clearTimeout(shutdownTimer));
          if (!stopped) {
            child.kill("SIGKILL");
            await exitPromise;
          }
        }
        if (producer !== undefined) await producer.onApplicationShutdown();
        if (queue !== undefined && testJobId !== undefined) {
          const job = await queue.getJob(testJobId);
          if (job !== undefined) await job.remove();
          assert.equal(await queue.getJob(testJobId), undefined);
        }
      } finally {
        if (queue !== undefined) await queue.close();
        connection.disconnect();
      }
    });
    queue = new Queue(SYSTEM_QUEUE_NAME, { connection, prefix: "airmech" });
    queue.on("error", () => undefined);
    const listener = createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const { port } = listener.address();
    await new Promise((resolve, reject) =>
      listener.close((error) => (error ? reject(error) : resolve())),
    );
    const environment = {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      REDIS_ENABLED: "true",
      REDIS_URL: configuration.url,
      DATABASE_ENABLED: "false",
      STORAGE_ENABLED: "false",
    };
    delete environment.ENV_FILE;
    const root = path.resolve(__dirname, "../..");
    child = spawn(process.execPath, [path.join(root, "apps/worker/dist/main.js")], {
      cwd: root,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    exitPromise = new Promise((resolve) =>
      child.once("close", () => {
        exited = true;
        resolve();
      }),
    );
    const events = [];
    let stdout = "";
    let spawnFailed = false;
    child.on("error", () => {
      spawnFailed = true;
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split("\n");
      stdout = lines.pop();
      for (const line of lines) {
        try {
          events.push(JSON.parse(line));
        } catch {
          /* No raw process output is printed. */
        }
      }
    });
    child.stderr.resume();
    const readyDeadline = performance.now() + 10_000;
    while (!events.some((event) => event.event === "process_started")) {
      assert.equal(
        spawnFailed || exited,
        false,
        "The compiled worker must remain alive until readiness.",
      );
      assert.ok(
        performance.now() < readyDeadline,
        "The compiled worker must start within its deadline.",
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const startup = events.find((event) => event.event === "process_started");
    assert.equal(startup.activeProcessors, 1);
    assert.equal(startup.mode, "infrastructure");
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "worker" });
    const { SystemQueueService } =
      await import("../../apps/api/dist/infrastructure/queue/system-queue.service.js");
    producer = new SystemQueueService(configuration, { onEvent: () => undefined });
    const requestId = `main-${randomUUID()}`;
    testJobId = systemJobId(requestId);
    const { jobId } = await producer.enqueueHealthcheck(requestId);
    const job = await waitForState(queue, jobId, "completed");
    assert.equal(job.returnvalue.requestId, requestId);
    assert.equal(job.returnvalue.status, "ok");
    const eventDeadline = performance.now() + 3_000;
    while (!events.some((event) => event.event === "job_completed" && event.jobId === jobId)) {
      assert.ok(
        performance.now() < eventDeadline,
        "The owned compiled worker must record its completed job.",
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  },
);
