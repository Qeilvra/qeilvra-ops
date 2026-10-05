const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { AuthMessageProducer, AUTH_MESSAGE_JOB, processAuthMessageJob } = require("@airmech/queue");

test("authentication message infrastructure stays offline until enqueue and persists only record references", async () => {
  const producer = new AuthMessageProducer({ enabled: false, url: null });
  await assert.rejects(producer.enqueue(randomUUID()));
  await producer.close();
  await producer.close();
  const recordId = randomUUID();
  let received;
  assert.deepEqual(
    await processAuthMessageJob(
      { name: AUTH_MESSAGE_JOB, data: { recordId }, attemptsMade: 2 },
      async (data, attempt) => {
        received = { data, attempt };
        return { status: "sent" };
      },
    ),
    { status: "sent" },
  );
  assert.deepEqual(received, { data: { recordId }, attempt: 2 });
  for (const data of [{ recordId, password: "fake-secret" }, { recordId: "not-uuid" }, null])
    await assert.rejects(
      processAuthMessageJob({ name: AUTH_MESSAGE_JOB, data }, async () => {
        throw new Error("Must not run");
      }),
      { name: "UnrecoverableError" },
    );
});

test("worker failures never persist raw provider errors or credentials into Redis", async () => {
  await assert.rejects(
    processAuthMessageJob(
      { name: AUTH_MESSAGE_JOB, data: { recordId: randomUUID() } },
      async () => {
        throw new Error("never-store-this-fake-provider-secret");
      },
    ),
    (error) => {
      assert.equal(error.code, "JOB_PROCESSING_FAILED");
      assert.equal(
        `${error.stack}${JSON.stringify(error)}`.includes("never-store-this-fake-provider-secret"),
        false,
      );
      return true;
    },
  );
});
