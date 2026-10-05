"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ErrorState, Skeleton } from "@airmech/ui";
import { apiRequest, safeMessage } from "@/lib/api/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    // Remove credentials from navigation history before any API operation.
    window.history.replaceState(null, "", "/auth/callback");
    if (params.has("error") || (!code && !(type === "invite" && tokenHash))) {
      setError("This link is invalid or has expired. Request a new link.");
      return;
    }
    const operation = code
      ? apiRequest("/auth/recovery/complete", { method: "POST", body: { code } })
      : apiRequest("/auth/invitation/complete", { method: "POST", body: { tokenHash } });
    operation
      .then(() => router.replace("/auth/reset-password"))
      .catch((failure) => setError(safeMessage(failure)));
  }, [router]);
  return (
    <main id="main-content" className="auth-page">
      <section className="auth-panel">
        <h1>Verify your link</h1>
        {error ? (
          <ErrorState action={<Link href="/forgot-password">Request a new link</Link>}>
            {error}
          </ErrorState>
        ) : (
          <>
            <p role="status">Verifying your link…</p>
            <Skeleton />
          </>
        )}
      </section>
    </main>
  );
}
