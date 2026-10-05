const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { readMigrations } = require("@airmech/database");

test("Windows and Unix Git checkouts preserve all migration checksums", async () => {
  const workspace = path.resolve(__dirname, "../..");
  const cache = path.join(workspace, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(cache, "migration-checkout-"));
  const relative = path.relative(workspace, scratch).split(path.sep).join("/");
  const migrations = await readMigrations();
  const files = migrations.map((migration) => `packages/database/migrations/${migration.name}`);
  try {
    for (const mode of ["true", "false"]) {
      const prefix = `${relative}/${mode}/`;
      fs.mkdirSync(path.join(workspace, prefix), { recursive: true });
      const checkout = spawnSync(
        "git",
        ["-c", `core.autocrlf=${mode}`, "checkout-index", `--prefix=${prefix}`, "--", ...files],
        {
          cwd: workspace,
          windowsHide: true,
          stdio: "ignore",
        },
      );
      assert.equal(checkout.status, 0, "Migration checkout must succeed");
      for (const migration of migrations) {
        const bytes = fs.readFileSync(
          path.join(workspace, prefix, "packages/database/migrations", migration.name),
        );
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          migration.checksum,
          `Migration checksum changed with core.autocrlf=${mode}`,
        );
      }
    }
  } finally {
    const target = fs.realpathSync(scratch);
    const expectedParent = path.join(fs.realpathSync(workspace), ".cache");
    assert.equal(
      path.dirname(target),
      expectedParent,
      "Cleanup must stay inside the workspace cache",
    );
    fs.rmSync(target, { recursive: true, force: true });
  }
});
