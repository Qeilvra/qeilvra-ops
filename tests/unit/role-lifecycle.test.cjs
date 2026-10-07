const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

test("role mutations recheck current authority instead of trusting a stale Super Admin principal", async () => {
  const { UserAdministrationService } =
    await import("../../apps/api/dist/modules/users/user-admin.service.js");
  const stale = {
    user: { id: randomUUID(), identityId: randomUUID(), status: "active" },
    roles: ["super_admin"],
    permissions: ["admin.roles"],
  };
  for (const status of ["active", "disabled"]) {
    const writes = [];
    const transaction = {
      query: async (sql) => {
        if (sql.startsWith("SELECT pg_advisory")) return [];
        if (sql.startsWith("SELECT u.*"))
          return [
            {
              id: stale.user.id,
              identity_id: stale.user.identityId,
              email: "fixture@example.invalid",
              display_name: "Fixture",
              employee_code: null,
              job_title: null,
              phone: null,
              status,
              last_login_at: null,
              roles: ["engineer"],
              permissions: ["admin.roles"],
              grants: [{ role: "engineer", permission: "admin.roles" }],
            },
          ];
        writes.push(sql);
        return [];
      },
    };
    const service = new UserAdministrationService({
      databaseClient: { transaction: (operation) => operation(transaction) },
    });
    await assert.rejects(
      service.roleStatus("engineer", false, stale, {}),
      (error) => error.getStatus() === (status === "active" ? 403 : 401),
    );
    assert.deepEqual(writes, []);
  }
});
