const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { createTestEnvironment } = require("@airmech/testing");

/** Built UI for real API integration, with an owned loopback process and no private env. */
async function startLocalWeb({ port: requestedPort } = {}) {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(requestedPort ?? 0, "127.0.0.1", resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const cwd = path.resolve(__dirname, "../../apps/web");
  const child = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next", { paths: [cwd] }),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd,
      windowsHide: true,
      env: createTestEnvironment(
        { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
        process.env,
      ),
      stdio: "ignore",
    },
  );
  let failure;
  child.on("error", (error) => {
    failure = error;
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const url = `http://127.0.0.1:${port}`;
  const close = async () => {
    if (child.exitCode !== null) return;
    child.kill();
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await Promise.race([exited, delay(3000)]);
    }
    assert.ok(child.exitCode !== null || child.signalCode !== null, "Owned UI process must stop");
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (failure || child.exitCode !== null) throw new Error("Built local UI could not start");
      try {
        const response = await fetch(`${url}/login`, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok) return { url, close };
      } catch {
        /* bounded startup retry */
      }
      await delay(100);
    }
    throw new Error("Built local UI startup timed out");
  } catch (error) {
    await close();
    throw error;
  }
}

module.exports = { startLocalWeb };
