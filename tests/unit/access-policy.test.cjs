const assert = require("node:assert/strict");
const test = require("node:test");
const { hasPermission } = require("@airmech/contracts");

test("permissions deny anonymous, invited and disabled users and never infer role authority", () => {
  assert.equal(hasPermission(null, "admin.users"), false);
  const principal = { user: { status: "active" }, roles: ["super_admin"], permissions: [] };
  assert.equal(hasPermission(principal, "admin.users"), false);
  principal.permissions.push("admin.users");
  assert.equal(hasPermission(principal, "admin.users"), true);
  for (const status of ["invited", "disabled"]) {
    principal.user.status = status;
    assert.equal(hasPermission(principal, "admin.users"), false);
  }
});

test("server access requires an explicit object policy in addition to a permission", async () => {
  const { requireAccess } = await import("../../apps/api/dist/modules/auth/access.policy.js");
  const principal = { user: { status: "active" }, roles: [], permissions: ["workorder.read"] };
  assert.throws(
    () => requireAccess(null, "workorder.read", true),
    (e) => e.getStatus() === 401,
  );
  assert.throws(
    () => requireAccess(principal, "workorder.read"),
    (e) => e.getStatus() === 403,
  );
  assert.throws(
    () => requireAccess(principal, "admin.users", true),
    (e) => e.getStatus() === 403,
  );
  assert.doesNotThrow(() => requireAccess(principal, "workorder.read", true));
});
