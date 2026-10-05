const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { startChild, stopChild } = require("../../scripts/test-browser.cjs");

test("post-spawn errors fail cleanup only after the owned process has actually exited", async () => {
  const owned = startChild("-e", ["setInterval(() => {}, 1000)"]);
  const reported = new Error("Owned process reported a post-spawn error.");
  try {
    await once(owned.child, "spawn");
    owned.child.emit("error", reported);
    assert.equal(owned.error, reported);
    assert.equal(owned.result, undefined);
    assert.equal(owned.child.exitCode, null);

    await assert.rejects(stopChild(owned), (error) => error === reported);
    const result = await owned.exit;
    assert.equal(owned.result, result);
    assert.ok(owned.child.exitCode !== null || owned.child.signalCode !== null);
  } finally {
    await stopChild(owned).catch((error) => {
      if (error !== reported) throw error;
    });
  }
});
