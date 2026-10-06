"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { hasPermission, type AccessPrincipal } from "@airmech/contracts";
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchField,
  Select,
  Skeleton,
  StatusBadge,
} from "@airmech/ui";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { apiRequest, isRecord, safeMessage } from "@/lib/api/client";

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  employee_code: string | null;
  job_title: string | null;
  phone: string | null;
  status: "active" | "invited" | "disabled";
  roles: string[];
}
interface AdminRole {
  code: string;
  name: string;
  permissions: string[];
  allowedPermissions: string[];
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw new Error("Invalid response");
  return value as string[];
}
function rolesResponse(value: unknown): { items: AdminRole[]; permissions: string[] } {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.permissions))
    throw new Error("Invalid response");
  const items = value.items.map((item: unknown) => {
    if (!isRecord(item) || typeof item.code !== "string" || typeof item.name !== "string")
      throw new Error("Invalid response");
    return {
      code: item.code,
      name: item.name,
      permissions: strings(item.permissions),
      allowedPermissions: strings(item.allowedPermissions),
    };
  });
  const permissions = value.permissions.map((item: unknown) => {
    if (!isRecord(item) || typeof item.code !== "string") throw new Error("Invalid response");
    return item.code;
  });
  return { items, permissions };
}
function usersResponse(value: unknown): { items: AdminUser[]; total: number } {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.total !== "number")
    throw new Error("Invalid response");
  const items = value.items.map((item: unknown): AdminUser => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.email !== "string" ||
      typeof item.display_name !== "string" ||
      !["active", "invited", "disabled"].includes(String(item.status))
    )
      throw new Error("Invalid response");
    for (const field of ["employee_code", "job_title", "phone"])
      if (item[field] !== null && typeof item[field] !== "string")
        throw new Error("Invalid response");
    return {
      id: item.id,
      email: item.email,
      display_name: item.display_name,
      employee_code: item.employee_code as string | null,
      job_title: item.job_title as string | null,
      phone: item.phone as string | null,
      status: item.status as AdminUser["status"],
      roles: strings(item.roles),
    };
  });
  return { items, total: value.total };
}

function UserManagement({ principal }: { principal: AccessPrincipal }) {
  const [records, setRecords] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<AdminUser | null>(null);
  const canManage =
    principal.roles.includes("super_admin") && hasPermission(principal, "admin.users");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [list, catalog] = await Promise.all([
          apiRequest(
            `/admin/users?page=${page}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`,
            signal ? { signal } : {},
          ),
          apiRequest("/admin/roles", signal ? { signal } : {}),
        ]);
        const result = usersResponse(list);
        setRecords(result.items);
        setTotal(result.total);
        setRoles(rolesResponse(catalog).items);
      } catch (failure: unknown) {
        if (!signal?.aborted) setError(safeMessage(failure));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, search, status],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => setError("Users could not be loaded."));
    return () => controller.abort();
  }, [load]);

  async function action(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(success);
      setEditing(null);
      setConfirming(null);
      await load();
    } catch (failure: unknown) {
      setError(safeMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (editing === "new")
      await action(
        () =>
          apiRequest("/admin/users", {
            method: "POST",
            body: {
              email: String(data.get("email")),
              displayName: String(data.get("displayName")),
              roles: selectedRoles,
            },
          }),
        "Invitation requested.",
      );
    else if (editing) {
      const current = editing;
      await action(
        () =>
          apiRequest(`/admin/users/${current.id}`, {
            method: "PATCH",
            body: {
              displayName: String(data.get("displayName")),
              employeeCode: String(data.get("employeeCode") ?? "") || null,
              jobTitle: String(data.get("jobTitle") ?? "") || null,
              phone: String(data.get("phone") ?? "") || null,
            },
          }),
        "User profile saved.",
      );
    }
  }
  const roleChoices = (
    <fieldset className="admin-role-choices">
      <legend>Assigned roles</legend>
      {roles.map((role) => (
        <Checkbox
          key={role.code}
          id={`user-role-${role.code}`}
          label={role.name}
          checked={selectedRoles.includes(role.code)}
          disabled={busy}
          onChange={(event) =>
            setSelectedRoles((current) =>
              event.target.checked
                ? [...current, role.code]
                : current.filter((code) => code !== role.code),
            )
          }
        />
      ))}
    </fieldset>
  );
  const openUser = (user: AdminUser | "new") => {
    setError(null);
    setNotice(null);
    setEditing(user);
    setSelectedRoles(user === "new" ? [] : user.roles);
  };
  return (
    <>
      <PageHeader
        title="Users"
        description="Individual accounts and current access."
        actions={
          canManage && hasPermission(principal, "user.create") ? (
            <Button onClick={() => openUser("new")}>Invite user</Button>
          ) : undefined
        }
      />
      <form
        className="admin-actions"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setPage(1);
          setSearch(String(data.get("search") ?? ""));
          setStatus(String(data.get("status") ?? ""));
        }}
      >
        <SearchField
          id="user-search"
          label="Find users"
          name="search"
          placeholder="Email or name prefix"
          maxLength={120}
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <Select id="user-status" label="Account status" name="status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="disabled">Disabled</option>
        </Select>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <ErrorState
          action={
            <Button
              variant="secondary"
              onClick={() => {
                load().catch(() => setError("Users could not be loaded."));
              }}
            >
              Retry
            </Button>
          }
        >
          {error}
        </ErrorState>
      )}
      {loading ? (
        <>
          <p role="status">Loading users…</p>
          <Skeleton />
        </>
      ) : (
        <>
          <DataTable
            rows={records}
            rowKey={(row) => row.id}
            caption="Application users"
            empty={<EmptyState title="No users match" />}
            columns={[
              {
                key: "name",
                label: "Name",
                render: (row) => (
                  <>
                    <strong>{row.display_name}</strong>
                    <p>{row.email}</p>
                  </>
                ),
              },
              {
                key: "roles",
                label: "Roles",
                render: (row) =>
                  row.roles
                    .map((code) => roles.find((role) => role.code === code)?.name ?? code)
                    .join(", ") || "No roles",
              },
              {
                key: "status",
                label: "Status",
                render: (row) => (
                  <StatusBadge
                    tone={
                      row.status === "active"
                        ? "success"
                        : row.status === "disabled"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {row.status}
                  </StatusBadge>
                ),
              },
              ...(canManage
                ? [
                    {
                      key: "actions",
                      label: "Actions",
                      render: (row: AdminUser) => (
                        <div className="admin-actions">
                          <Button variant="secondary" onClick={() => openUser(row)}>
                            Edit
                          </Button>
                          <Button
                            variant={row.status !== "disabled" ? "danger" : "secondary"}
                            onClick={() => setConfirming(row)}
                          >
                            {row.status !== "disabled" ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <Pagination
            page={Math.min(page, Math.max(1, Math.ceil(total / 25)))}
            pageCount={Math.max(1, Math.ceil(total / 25))}
            onPageChange={setPage}
          />
        </>
      )}
      <Modal
        open={editing !== null}
        title={editing === "new" ? "Invite user" : "Edit user"}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        {editing && (
          <>
            <form
              className="admin-form"
              onSubmit={(event) => {
                saveProfile(event).catch(() => setError("The change could not be completed."));
              }}
            >
              {editing === "new" ? (
                <Input
                  id="user-email"
                  label="Email"
                  name="email"
                  type="email"
                  required
                  maxLength={320}
                  disabled={busy}
                />
              ) : (
                <p>{editing.email}</p>
              )}
              <Input
                id="user-display-name"
                label="Name"
                name="displayName"
                required
                maxLength={120}
                defaultValue={editing === "new" ? "" : editing.display_name}
                disabled={busy}
              />
              {editing === "new" ? (
                roleChoices
              ) : (
                <>
                  <Input
                    id="user-employee-code"
                    label="Employee code"
                    name="employeeCode"
                    maxLength={64}
                    defaultValue={editing.employee_code ?? ""}
                    disabled={busy}
                  />
                  <Input
                    id="user-job-title"
                    label="Job title"
                    name="jobTitle"
                    maxLength={120}
                    defaultValue={editing.job_title ?? ""}
                    disabled={busy}
                  />
                  <Input
                    id="user-phone"
                    label="Phone"
                    name="phone"
                    maxLength={40}
                    defaultValue={editing.phone ?? ""}
                    disabled={busy}
                  />
                </>
              )}
              {error && <ErrorState>{error}</ErrorState>}
              <Button type="submit" busy={busy}>
                {editing === "new" ? "Send invitation" : "Save profile"}
              </Button>
            </form>
            {editing !== "new" && (
              <form
                className="admin-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const current = editing;
                  action(
                    () =>
                      apiRequest(`/admin/users/${current.id}/roles`, {
                        method: "POST",
                        body: { roles: selectedRoles },
                      }),
                    "Roles saved. Existing sessions were revoked.",
                  ).catch(() => setError("Roles could not be saved."));
                }}
              >
                {roleChoices}
                <p>
                  Changing roles signs this user out. The final active Super Admin is protected.
                </p>
                <Button type="submit" variant="secondary" busy={busy}>
                  Save roles
                </Button>
              </form>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={confirming !== null}
        title={confirming?.status !== "disabled" ? "Disable account" : "Enable account"}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirming(null);
        }}
      >
        {confirming && (
          <>
            <p>
              {confirming.status !== "disabled"
                ? "This user will lose application access and all current sessions."
                : "This user will regain access through a new sign-in."}
            </p>
            <p>{confirming.display_name}</p>
            <Button
              variant="danger"
              busy={busy}
              onClick={() => {
                const current = confirming;
                action(
                  () =>
                    apiRequest(
                      `/admin/users/${current.id}/${current.status !== "disabled" ? "disable" : "enable"}`,
                      { method: "POST" },
                    ),
                  "Account status updated.",
                ).catch(() => setError("The status could not be changed."));
              }}
            >
              Confirm
            </Button>
            {error && <ErrorState>{error}</ErrorState>}
          </>
        )}
      </Modal>
    </>
  );
}

function RoleManagement({ principal }: { principal: AccessPrincipal }) {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AdminRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const canManage =
    principal.roles.includes("super_admin") && hasPermission(principal, "admin.roles");
  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/admin/roles", { signal: controller.signal })
      .then((value) => {
        const result = rolesResponse(value);
        setRoles(result.items);
        setCatalog(result.permissions);
        setLoading(false);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(safeMessage(failure));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [revision]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/roles/${editing.code}`, {
        method: "PATCH",
        body: { name: String(data.get("name")), permissions },
      });
      setEditing(null);
      setRevision((value) => value + 1);
    } catch (failure: unknown) {
      setError(safeMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Roles and permissions"
        description="Permission grants and record scope both apply. Management has read-only access."
      />
      {error && (
        <ErrorState
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setLoading(true);
                setRevision((value) => value + 1);
              }}
            >
              Retry
            </Button>
          }
        >
          {error}
        </ErrorState>
      )}
      {loading ? (
        <Skeleton />
      ) : (
        <DataTable
          rows={roles}
          rowKey={(row) => row.code}
          caption="Role grants"
          columns={[
            { key: "role", label: "Role", render: (row) => <strong>{row.name}</strong> },
            {
              key: "grants",
              label: "Permissions",
              render: (row) => (
                <details>
                  <summary>{row.permissions.length} action grants</summary>
                  <ul>
                    {row.permissions.map((permission) => (
                      <li key={permission}>{permission}</li>
                    ))}
                  </ul>
                </details>
              ),
            },
            ...(canManage
              ? [
                  {
                    key: "actions",
                    label: "Actions",
                    render: (row: AdminRole) => (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditing(row);
                          setPermissions(row.permissions);
                        }}
                      >
                        Manage grants
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
      <Modal
        open={editing !== null}
        title="Manage role grants"
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        {editing && (
          <form
            className="admin-form"
            onSubmit={(event) => {
              save(event).catch(() => setError("Grants could not be saved."));
            }}
          >
            <Input
              id="role-name"
              name="name"
              label="Role name"
              required
              maxLength={120}
              defaultValue={editing.name}
            />
            <p>
              Existing sessions for this role are revoked after a change. Approved role scope and
              required administrator access remain enforced.
            </p>
            <fieldset className="admin-role-choices">
              <legend>Action grants</legend>
              {catalog
                .filter((code) => editing.allowedPermissions.includes(code))
                .map((code) => (
                  <Checkbox
                    key={code}
                    id={`grant-${code.replaceAll(".", "-")}`}
                    label={code}
                    checked={permissions.includes(code)}
                    disabled={busy}
                    onChange={(event) =>
                      setPermissions((current) =>
                        event.target.checked
                          ? [...current, code]
                          : current.filter((item) => item !== code),
                      )
                    }
                  />
                ))}
            </fieldset>
            {error && <ErrorState>{error}</ErrorState>}
            <Button type="submit" busy={busy}>
              Save grants
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}

export function UserAdministrationPage() {
  return (
    <WorkspaceFrame>
      {(principal) =>
        hasPermission(principal, "user.read") ? (
          <UserManagement principal={principal} />
        ) : (
          <ErrorState>You do not have permission to view users.</ErrorState>
        )
      }
    </WorkspaceFrame>
  );
}
export function RoleAdministrationPage() {
  return (
    <WorkspaceFrame>
      {(principal) =>
        hasPermission(principal, "role.read") ? (
          <RoleManagement principal={principal} />
        ) : (
          <ErrorState>You do not have permission to view role configuration.</ErrorState>
        )
      }
    </WorkspaceFrame>
  );
}
