const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout, clearTimeout } = require("node:timers");
const { setTimeout: delay } = require("node:timers/promises");
const { createTestEnvironment } = require("@airmech/testing");

const workspace = path.resolve(__dirname, "..");

async function availablePort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  await new Promise((resolve, reject) => {
    reservation.close((error) => (error ? reject(error) : resolve()));
  });
  if (address === null || typeof address === "string") {
    throw new Error("Could not allocate a loopback browser-test port.");
  }
  return address.port;
}

function startChild(entry, args, options = {}) {
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: workspace,
    env: createTestEnvironment({}, process.env),
    stdio: "inherit",
    ...options,
    shell: false,
    windowsHide: true,
  });
  const owned = { child, result: undefined, error: undefined, exit: undefined };
  owned.exit = new Promise((resolve) => {
    const finish = (result) => {
      owned.result ??= result;
      resolve(owned.result);
    };
    child.on("error", (error) => {
      owned.error ??= error;
      if (!child.pid) finish({ code: null, signal: null, error });
    });
    child.once("exit", (code, signal) => finish({ code, signal }));
  });
  return owned;
}

async function within(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopChild(owned) {
  if (!owned) return;
  if (!owned.result) {
    owned.child.kill("SIGTERM");
    try {
      await within(owned.exit, 3000, "Owned test process did not stop after SIGTERM.");
    } catch {
      if (!owned.result) owned.child.kill("SIGKILL");
      await within(owned.exit, 3000, "Could not stop an owned browser-test process.");
    }
  }
  if (owned.error) throw owned.error;
}

async function main() {
  let server;
  let browser;
  let failure;
  let interruption;
  let interrupt;
  const interrupted = new Promise((resolve) => {
    interrupt = resolve;
  });
  const onSigint = () => {
    interruption = "SIGINT";
    process.exitCode = 130;
    interrupt();
  };
  const onSigterm = () => {
    interruption = "SIGTERM";
    process.exitCode = 143;
    interrupt();
  };
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    const port = await availablePort();
    const baseURL = `http://127.0.0.1:${port}`;
    const environment = createTestEnvironment(
      {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_NAME: "Airmech One",
        NEXT_TELEMETRY_DISABLED: "1",
        AIRMECH_BROWSER_BASE_URL: baseURL,
      },
      process.env,
    );
    const browserEnvironment = createTestEnvironment(
      {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_NAME: "Airmech One",
        AIRMECH_BROWSER_BASE_URL: baseURL,
        PLAYWRIGHT_CHROMIUM_EXECUTABLE: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      },
      process.env,
    );
    const nextEntry = require.resolve("next/dist/bin/next", {
      paths: [path.join(workspace, "apps/web")],
    });
    server = startChild(
      nextEntry,
      ["start", "apps/web", "--hostname", "127.0.0.1", "--port", String(port)],
      { env: environment, stdio: ["ignore", "pipe", "inherit"] },
    );
    let output = "";
    let announcedReady = false;
    server.child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output = (output + chunk.toString()).slice(-2048);
      announcedReady ||= output.includes("Ready in ");
    });

    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if (interruption) throw new Error(`Browser tests interrupted by ${interruption}.`);
      if (server.result) {
        throw server.result.error ?? new Error("Owned web server exited before becoming ready.");
      }
      // Both signals must come from a running owned server before tests can use its port.
      if (announcedReady) {
        try {
          const response = await fetch(baseURL, { signal: AbortSignal.timeout(500) });
          await response.body?.cancel();
          if (response.status === 200 && !server.result) {
            ready = true;
            break;
          }
        } catch {
          // Retry only the bounded local readiness probe while the owned process is alive.
        }
      }
      await delay(100);
    }
    if (!ready) throw new Error("Owned web server did not become ready within 30 seconds.");
    if (interruption) throw new Error(`Browser tests interrupted by ${interruption}.`);

    browser = startChild(
      require.resolve("@playwright/test/cli"),
      ["test", ...process.argv.slice(2)],
      {
        env: browserEnvironment,
      },
    );
    const completed = await Promise.race([
      browser.exit.then((result) => ({ source: "browser", result })),
      server.exit.then((result) => ({ source: "server", result })),
      interrupted.then(() => ({ source: "interrupt" })),
    ]);
    if (completed.source === "interrupt") {
      throw new Error(`Browser tests interrupted by ${interruption}.`);
    }
    if (completed.source === "server") {
      throw completed.result.error ?? new Error("Owned web server exited during browser tests.");
    }
    if (completed.result.error) throw completed.result.error;
    if (completed.result.code !== 0) {
      process.exitCode = completed.result.code ?? 1;
      throw new Error(`Playwright failed (${completed.result.signal ?? completed.result.code}).`);
    }
  } catch (error) {
    failure = error;
  } finally {
    const cleanup = await Promise.allSettled([stopChild(browser), stopChild(server)]);
    for (const result of cleanup) {
      if (result.status === "rejected") {
        console.error("Browser-test cleanup failed:", result.reason);
        failure ??= new Error("Browser-test cleanup failed.");
      }
    }
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
  if (failure) throw failure;
}

module.exports = { startChild, stopChild };

if (require.main === module) {
  main().catch((error) => {
    console.error("Browser-test runner:", error);
    process.exitCode ||= 1;
  });
}
