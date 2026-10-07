"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandSignature, Button, ErrorState, Input, PageHeader } from "@airmech/ui";
import { apiRequest, ApiRequestError, safeMessage } from "@/lib/api/client";

export function AuthForm({ mode }: { mode: "login" | "request" | "password" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [ready, setReady] = useState(mode !== "password");
  useEffect(() => {
    if (mode !== "password") return;
    const controller = new AbortController();
    apiRequest("/auth/recovery/status", { signal: controller.signal })
      .then(() => setReady(true))
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setError(
          failure instanceof ApiRequestError && failure.status === 400
            ? "This reset link is invalid or has expired. Request a new link."
            : safeMessage(failure),
        );
      });
    return () => controller.abort();
  }, [mode]);
  const title =
    mode === "login"
      ? "Sign in"
      : mode === "request"
        ? "Reset your password"
        : "Choose a new password";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    try {
      if (mode === "login") {
        await apiRequest("/auth/login", { method: "POST", body: { email, password } });
        form.reset();
        router.replace("/workspace");
      } else if (mode === "request") {
        await apiRequest("/auth/password-reset/request", { method: "POST", body: { email } });
        form.reset();
        setSent(true);
      } else {
        if (password !== data.get("confirmation")) {
          setError("The passwords do not match.");
          return;
        }
        await apiRequest("/auth/password-reset/complete", { method: "POST", body: { password } });
        form.reset();
        setSent(true);
      }
    } catch (failure: unknown) {
      if (mode === "password") {
        form.reset();
        setReady(false);
        setError(
          failure instanceof ApiRequestError && failure.status === 400
            ? "This reset link is invalid or has expired. Request a new link."
            : "Your password could not be saved. Request a new link and try again.",
        );
      } else setError(safeMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="auth-page">
      <section className="auth-panel">
        <BrandSignature />
        <PageHeader
          title={title}
          description={
            mode === "login"
              ? "Use your individual Airmech account."
              : mode === "request"
                ? "We will send instructions if your account exists."
                : "Use at least 12 characters. After saving, sign in again."
          }
        />
        {!ready ? (
          <>
            {error ? (
              <ErrorState action={<Link href="/forgot-password">Request a new link</Link>}>
                {error}
              </ErrorState>
            ) : (
              <p role="status">Checking your reset link…</p>
            )}
          </>
        ) : sent ? (
          <div role="status" className="ui-state">
            <p>
              {mode === "request"
                ? "If your account exists, instructions will arrive by email. Open the link in this browser."
                : "Your password was saved. Sign in with the new password."}
            </p>
            <Link href="/login">Back to sign in</Link>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              submit(event).catch(() => setError("The request could not be completed."));
            }}
            aria-busy={busy}
          >
            {mode !== "password" && (
              <Input
                id="auth-email"
                name="email"
                label="Email"
                type="email"
                autoComplete="username"
                required
                maxLength={320}
                disabled={busy}
              />
            )}
            {mode !== "request" && (
              <Input
                id="auth-password"
                name="password"
                label="Password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "password" ? 12 : 1}
                maxLength={mode === "password" ? 128 : 1024}
                disabled={busy}
              />
            )}
            {mode === "password" && (
              <Input
                id="auth-confirmation"
                name="confirmation"
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                disabled={busy}
              />
            )}
            {error && <ErrorState>{error}</ErrorState>}
            <Button type="submit" busy={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "request"
                    ? "Send reset instructions"
                    : "Save password"}
            </Button>
            {mode === "login" ? (
              <Link href="/forgot-password">Forgot password?</Link>
            ) : (
              <Link href="/login">Back to sign in</Link>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
