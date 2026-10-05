const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  ROLE_PERMISSION_BASELINE,
  SECURITY_PERMISSIONS,
} = require("../../apps/api/dist/modules/auth/permission-baseline.js");
const { canAccessRecord } = require("../../apps/api/dist/modules/auth/record.policy.js");
const {
  RecoveryCipher,
  cookieToken,
  newSessionToken,
  tokenDigest,
} = require("../../apps/api/dist/modules/auth/session-security.js");
const { readServerConfiguration, readWebGatewayConfiguration } = require("@airmech/config/server");

function principal(role, extraRoles = []) {
  const roles = [role, ...extraRoles];
  return {
    user: { id: randomUUID(), status: "active" },
    roles,
    permissions: [...new Set(roles.flatMap((item) => ROLE_PERMISSION_BASELINE[item] ?? []))],
    rolePermissions: Object.fromEntries(
      roles.map((item) => [item, ROLE_PERMISSION_BASELINE[item] ?? []]),
    ),
  };
}

test("the approved matrix reserves security mutations to Super Admin and grants Management read-only inspection", () => {
  assert.equal(Object.keys(ROLE_PERMISSION_BASELINE).length, 8);
  for (const [role, permissions] of Object.entries(ROLE_PERMISSION_BASELINE)) {
    assert.equal(new Set(permissions).size, permissions.length, role);
    for (const permission of SECURITY_PERMISSIONS)
      assert.equal(
        permissions.includes(permission),
        role === "super_admin",
        `${role}: ${permission}`,
      );
  }
  assert.ok(ROLE_PERMISSION_BASELINE.management.includes("user.read"));
  assert.ok(ROLE_PERMISSION_BASELINE.management.includes("permission.read"));
  for (const permission of [
    "quotation.read",
    "quotation.approve",
    "audit.read",
    "complaint.assign",
    "complaint.close",
    "user.read",
  ])
    assert.equal(ROLE_PERMISSION_BASELINE.engineer.includes(permission), false);
});

test("engineer record access requires assignment, ownership and explicit field-document visibility", () => {
  const engineer = principal("engineer");
  const assignedUserIds = [engineer.user.id];
  for (const resource of [
    "workorder",
    "customer",
    "site",
    "asset",
    "complaint",
    "warranty",
    "amc",
    "pm",
  ]) {
    assert.equal(
      canAccessRecord(engineer, `${resource}.read`, { resource, assignedUserIds }),
      true,
      resource,
    );
    assert.equal(
      canAccessRecord(engineer, `${resource}.read`, { resource, assignedUserIds: [randomUUID()] }),
      false,
      resource,
    );
  }
  assert.equal(
    canAccessRecord(engineer, "workorder.update_own", { resource: "workorder", assignedUserIds }),
    true,
  );
  assert.equal(
    canAccessRecord(engineer, "workorder.update_own", { resource: "asset", assignedUserIds }),
    false,
  );
  assert.equal(
    canAccessRecord(engineer, "document.field_read", { resource: "document", assignedUserIds }),
    false,
  );
  assert.equal(
    canAccessRecord(engineer, "document.field_read", {
      resource: "document",
      assignedUserIds,
      fieldUseAllowed: true,
    }),
    true,
  );
  assert.equal(
    canAccessRecord(engineer, "service_report.write_own", {
      resource: "service_report",
      assignedUserIds,
      ownerUserId: randomUUID(),
    }),
    false,
  );
  assert.equal(
    canAccessRecord(engineer, "service_report.write_own", {
      resource: "service_report",
      assignedUserIds,
      ownerUserId: engineer.user.id,
    }),
    true,
  );
  assert.equal(
    canAccessRecord({ ...engineer, user: { ...engineer.user, status: "disabled" } }, "asset.read", {
      resource: "asset",
      assignedUserIds,
    }),
    false,
  );
});

test("project/relevant/limited scopes deny missing relationships and mixed roles do not widen write scope", () => {
  const project = principal("project_manager", ["accounts"]);
  assert.equal(canAccessRecord(project, "project.write", { resource: "project" }), false);
  assert.equal(
    canAccessRecord(project, "project.write", {
      resource: "project",
      projectUserIds: [project.user.id],
    }),
    true,
  );
  assert.equal(canAccessRecord(project, "project.read", { resource: "project" }), true);
  const service = principal("service_manager");
  assert.equal(canAccessRecord(service, "customer.write", { resource: "customer" }), false);
  assert.equal(
    canAccessRecord(service, "quotation.read", { resource: "quotation", serviceRelated: false }),
    false,
  );
  const store = principal("store");
  assert.equal(canAccessRecord(store, "workorder.parts", { resource: "workorder" }), false);
  assert.equal(
    canAccessRecord(store, "workorder.parts", { resource: "workorder", inventoryRelated: true }),
    true,
  );
});

test("opaque cookies reject duplicate or malformed tokens and recovery envelopes detect modification", () => {
  const token = newSessionToken();
  assert.equal(token.length, 43);
  assert.match(tokenDigest(token), /^[0-9a-f]{64}$/);
  assert.equal(cookieToken(`other=x; airmech_session=${token}`, "airmech_session"), token);
  assert.equal(
    cookieToken(`airmech_session=${token}; airmech_session=${token}`, "airmech_session"),
    null,
  );
  assert.equal(cookieToken("airmech_session=malformed", "airmech_session"), null);
  const cipher = new RecoveryCipher("test-only-secret".repeat(4));
  const encrypted = cipher.seal("fake-provider-recovery-token");
  assert.equal(cipher.open(encrypted), "fake-provider-recovery-token");
  assert.equal(encrypted.includes("fake-provider"), false);
  const bytes = Buffer.from(encrypted, "base64url");
  bytes[15] ^= 1;
  assert.throws(() => cipher.open(bytes.toString("base64url")));
  assert.throws(() => new RecoveryCipher("different-test-secret").open(encrypted));
});

test("auth configuration rejects remote plaintext origins, misplaced Supabase paths and unsafe session durations", () => {
  const base = {
    AUTH_ENABLED: "true",
    AUTH_SECRET: "t".repeat(32),
    APP_URL: "http://localhost:3000",
    DATABASE_ENABLED: "true",
    DATABASE_URL: "postgresql://localhost/test",
    SUPABASE_URL: "https://provider.example.invalid",
    SUPABASE_ANON_KEY: "fake-public-key",
    SUPABASE_SERVICE_ROLE_KEY: "fake-private-key",
  };
  assert.equal(readServerConfiguration("api", base).auth.sessionSeconds, 28800);
  for (const [setting, value] of [
    ["APP_URL", "http://app.example.invalid"],
    ["APP_URL", "http://localhost:3000/other"],
    ["SUPABASE_URL", "https://provider.example.invalid/rest/v1/"],
    ["SUPABASE_URL", "http://provider.example.invalid"],
    ["AUTH_SESSION_SECONDS", "0"],
    ["AUTH_SESSION_SECONDS", "86401"],
  ])
    assert.throws(() => readServerConfiguration("api", { ...base, [setting]: value }), { setting });
  assert.throws(
    () => readWebGatewayConfiguration({ API_INTERNAL_URL: "http://remote.example.invalid" }),
    { setting: "API_INTERNAL_URL" },
  );
});
