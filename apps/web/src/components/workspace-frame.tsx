"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasPermission, type AccessPrincipal } from "@airmech/contracts";
import { BrandSignature, Button, ErrorState, Skeleton } from "@airmech/ui";
import { apiRequest, ApiRequestError, safeMessage } from "@/lib/api/client";
import { readPrincipal } from "@/lib/auth/principal";
import { WorkspaceTools } from "@/components/workspace-tools";

export function WorkspaceFrame({
  children,
}: {
  children: (principal: AccessPrincipal) => ReactNode;
}) {
  const router = useRouter();
  const [principal, setPrincipal] = useState<AccessPrincipal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/auth/me", { signal: controller.signal })
      .then((result) => setPrincipal(readPrincipal(result)))
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiRequestError && failure.status === 401) router.replace("/login");
        else setError(safeMessage(failure));
      });
    return () => controller.abort();
  }, [router, revision]);
  async function logout() {
    setLeaving(true);
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      setPrincipal(null);
      router.replace("/login");
    } catch (failure: unknown) {
      setError(safeMessage(failure));
      throw failure;
    } finally {
      setLeaving(false);
    }
  }
  const navigation = (
    <>
      <Link href="/workspace">My workspace</Link>
      {hasPermission(principal, "user.read") && <Link href="/admin/users">Users</Link>}
      {hasPermission(principal, "role.read") && <Link href="/admin/roles">Roles</Link>}
    </>
  );
  return (
    <div className="workspace-frame">
      <header className="workspace-header">
        <BrandSignature compact />
        <div className="workspace-account">
          <span>{principal?.user.displayName}</span>
          {principal && (
            <WorkspaceTools principal={principal} leaving={leaving} onLogout={logout} />
          )}
        </div>
      </header>
      <div className="workspace-body">
        <nav className="workspace-sidebar" aria-label="Workspace navigation">
          {navigation}
        </nav>
        <main id="main-content" className="workspace-main">
          {error && (
            <ErrorState
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null);
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
          {principal
            ? children(principal)
            : !error && (
                <>
                  <p role="status">Loading your workspace…</p>
                  <Skeleton />
                </>
              )}
        </main>
      </div>
      <nav className="workspace-mobile-nav" aria-label="Mobile workspace navigation">
        {navigation}
      </nav>
    </div>
  );
}
