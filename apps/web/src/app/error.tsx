"use client";

import { StatusBadge, Surface } from "@airmech/ui";

import { StartupFrame } from "@/components/startup-frame";

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  const supportReference = error.digest && /^\d{1,32}$/.test(error.digest) ? error.digest : null;

  return (
    <StartupFrame>
      <Surface className="feedback-panel">
        <StatusBadge tone="danger">Screen unavailable</StatusBadge>
        <h1>The workspace could not load</h1>
        <p>
          Try loading this screen again. If it still fails, contact your system administrator and
          describe the screen you were opening.
        </p>
        {supportReference && (
          <p className="support-reference">Support reference: {supportReference}</p>
        )}
        <div className="feedback-actions">
          <button className="action-button" onClick={reset} type="button">
            Retry loading
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- A full document reload resets this error boundary. */}
          <a className="secondary-action" href="/">
            Return to workspace
          </a>
        </div>
      </Surface>
    </StartupFrame>
  );
}
