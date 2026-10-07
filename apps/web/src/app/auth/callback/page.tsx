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
    const verifyLink = () => {
      if (started.current && !window.location.search && !window.location.hash) return;
      started.current = true;
      setError(null);
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = fragment.get("access_token");
      const invitationSession =
        !code &&
        !tokenHash &&
        ["invite", "recovery"].includes(fragment.get("type") ?? "") &&
        accessToken;
      // Remove credentials from navigation history before any API operation.
      window.history.replaceState(null, "", "/auth/callback");
      if (
        params.has("error") ||
        fragment.has("error") ||
        (!code && !(type === "invite" && tokenHash) && !invitationSession)
      ) {
        setError("This link is invalid or has expired. Request a new link.");
        return;
      }
      const operation = invitationSession
        ? apiRequest("/auth/invitation/session", { method: "POST", body: { accessToken } })
        : code
          ? apiRequest("/auth/recovery/complete", { method: "POST", body: { code } })
          : apiRequest("/auth/invitation/complete", { method: "POST", body: { tokenHash } });
      operation
        .then(() => router.replace("/auth/reset-password"))
        .catch((failure) => setError(safeMessage(failure)));
    };
    verifyLink();
    window.addEventListener("hashchange", verifyLink);
    return () => window.removeEventListener("hashchange", verifyLink);
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
