"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hasPermission, type AccessPrincipal } from "@airmech/contracts";
import {
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Modal,
  SearchField,
  Skeleton,
  StatusBadge,
} from "@airmech/ui";
import { apiRequest, isRecord, safeMessage } from "@/lib/api/client";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

function readNotifications(value: unknown): { items: NotificationItem[]; hasMore: boolean } {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.hasMore !== "boolean")
    throw new Error("Invalid notification response");
  return {
    hasMore: value.hasMore,
    items: value.items.map((item: unknown): NotificationItem => {
      if (
        !isRecord(item) ||
        typeof item.id !== "string" ||
        typeof item.title !== "string" ||
        typeof item.message !== "string" ||
        typeof item.created_at !== "string" ||
        (item.read_at !== null && typeof item.read_at !== "string")
      )
        throw new Error("Invalid notification response");
      return {
        id: item.id,
        title: item.title,
        message: item.message,
        read_at: item.read_at,
        created_at: item.created_at,
      };
    }),
  };
}

function Notifications() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReturnType<typeof readNotifications> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/notifications?page=${page}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setResult(readNotifications(value));
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(safeMessage(failure));
      });
    return () => controller.abort();
  }, [page, revision]);
  const reload = () => {
    setError(null);
    setResult(null);
    setRevision((value) => value + 1);
  };
  return (
    <>
      {error && (
        <ErrorState
          action={
            <Button variant="secondary" onClick={reload}>
              Retry notifications
            </Button>
          }
        >
          {error}
        </ErrorState>
      )}
      {!result && !error && (
        <>
          <p role="status">Loading notifications…</p>
          <Skeleton />
        </>
      )}
      {result && (
        <>
          {result.items.length === 0 ? (
            <EmptyState title="No notifications">
              You have no in-app notifications on this page.
            </EmptyState>
          ) : (
            <ul className="workspace-notifications">
              {result.items.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <StatusBadge tone={item.read_at ? "info" : "warning"}>
                    {item.read_at ? "Read" : "Unread"}
                  </StatusBadge>
                  <p>{item.message}</p>
                  <time dateTime={item.created_at}>
                    {new Date(item.created_at).toLocaleString()}
                  </time>
                  {!item.read_at && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        setError(null);
                        apiRequest(`/notifications/${item.id}/read`, { method: "POST" })
                          .then(reload)
                          .catch((failure: unknown) => setError(safeMessage(failure)))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Mark as read
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="admin-actions">
            <Button
              variant="secondary"
              disabled={page === 1 || busy}
              onClick={() => {
                setResult(null);
                setError(null);
                setPage((value) => value - 1);
              }}
            >
              Previous notifications
            </Button>
            <span>Page {page}</span>
            <Button
              variant="secondary"
              disabled={!result.hasMore || busy}
              onClick={() => {
                setResult(null);
                setError(null);
                setPage((value) => value + 1);
              }}
            >
              Next notifications
            </Button>
          </div>
        </>
      )}
    </>
  );
}

export function WorkspaceTools({
  principal,
  leaving,
  onLogout,
}: {
  principal: AccessPrincipal;
  leaving: boolean;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState<"account" | "search" | "notifications" | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const destinations = [
    { href: "/workspace", label: "My workspace", allowed: true },
    { href: "/admin/users", label: "Users", allowed: hasPermission(principal, "user.read") },
    { href: "/admin/roles", label: "Roles", allowed: hasPermission(principal, "role.read") },
  ].filter((item) => item.allowed && item.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="workspace-tools">
      <Button variant="secondary" onClick={() => setOpen("search")}>
        Search workspace
      </Button>
      {hasPermission(principal, "notification.read") && (
        <Button variant="secondary" onClick={() => setOpen("notifications")}>
          Notifications
        </Button>
      )}
      <Button variant="secondary" onClick={() => setOpen("account")}>
        Account
      </Button>
      <Modal
        open={open === "account"}
        title="Your account"
        onOpenChange={(value) => {
          if (!value && !leaving) setOpen(null);
        }}
      >
        <dl className="workspace-profile">
          <dt>Name</dt>
          <dd>{principal.user.displayName}</dd>
          <dt>Email</dt>
          <dd>{principal.user.email}</dd>
          <dt>Employee code</dt>
          <dd>{principal.user.employeeCode ?? "Not recorded"}</dd>
          <dt>Job title</dt>
          <dd>{principal.user.jobTitle ?? "Not recorded"}</dd>
          <dt>Phone</dt>
          <dd>{principal.user.phone ?? "Not recorded"}</dd>
          <dt>Active roles</dt>
          <dd>{principal.roles.join(", ").replaceAll("_", " ") || "No active roles"}</dd>
        </dl>
        <nav className="workspace-menu" aria-label="Account navigation">
          <Link href="/workspace" onClick={() => setOpen(null)}>
            View my profile
          </Link>
          <Link href="/forgot-password">Reset password</Link>
        </nav>
        {error && <ErrorState>{error}</ErrorState>}
        <Button
          busy={leaving}
          variant="secondary"
          onClick={() => {
            onLogout().catch((failure: unknown) => setError(safeMessage(failure)));
          }}
        >
          Sign out
        </Button>
      </Modal>
      <Modal
        open={open === "search"}
        title="Search workspace"
        onOpenChange={(value) => {
          if (!value) setOpen(null);
        }}
      >
        <SearchField
          id="workspace-search"
          label="Find a page"
          value={query}
          maxLength={120}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p>Find pages available to your account.</p>
        <nav className="workspace-menu" aria-label="Search results">
          {destinations.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(null)}>
              {item.label}
            </Link>
          ))}
        </nav>
        {destinations.length === 0 && <EmptyState title="No accessible pages match" />}
      </Modal>
      <Drawer
        open={open === "notifications"}
        title="Notifications"
        onOpenChange={(value) => {
          if (!value) setOpen(null);
        }}
      >
        {open === "notifications" && <Notifications />}
      </Drawer>
    </div>
  );
}
