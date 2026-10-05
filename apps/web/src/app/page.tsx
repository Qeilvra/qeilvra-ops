import { StatusBadge, Surface } from "@airmech/ui";

import { StartupFrame } from "@/components/startup-frame";

export default function StartupPage() {
  return (
    <StartupFrame>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace setup</p>
          <h1>Workspace foundation</h1>
        </div>
        <StatusBadge tone="info">Foundation stage</StatusBadge>
      </div>

      <Surface className="foundation-panel">
        <div className="foundation-summary">
          <div className="section-heading">
            <span className="section-marker" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" focusable="false">
                <path d="M4 20V4h16v16H4Zm0-6h16M10 4v16" />
              </svg>
            </span>
            <div>
              <h2>Airmech One</h2>
              <p>Operations Management System</p>
            </div>
          </div>
          <p className="foundation-description">
            The workspace foundation is being prepared for Airmech Oman. Operational workflows are
            not enabled yet.
          </p>
          <dl className="readiness-summary">
            <div>
              <dt>Current stage</dt>
              <dd>Repository foundation</dd>
            </div>
            <div>
              <dt>Operational access</dt>
              <dd>Not enabled</dd>
            </div>
          </dl>
        </div>

        <aside className="next-step" aria-labelledby="next-step-title">
          <p className="eyebrow">Next implementation step</p>
          <h2 id="next-step-title">Secure access</h2>
          <p>
            Individual accounts, secure sign-in and server-side permissions must be in place before
            business workflows are available.
          </p>
          <StatusBadge tone="warning">Access setup pending</StatusBadge>
        </aside>
      </Surface>

      <details className="readiness-details">
        <summary>
          <span>Workspace readiness details</span>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="m7 10 5 5 5-5" />
          </svg>
        </summary>
        <div className="readiness-detail-content">
          <p>
            This startup screen confirms the web application can render. It does not verify
            database, storage, background jobs or production readiness.
          </p>
          <p>
            Customer, commercial, project, service and maintenance workflows will be introduced in
            the documented task order, with the same permitted capabilities on desktop and mobile.
          </p>
        </div>
      </details>
    </StartupFrame>
  );
}
