"use client";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { PageHeader } from "@airmech/ui";

export default function WorkspacePage() {
  return (
    <WorkspaceFrame>
      {(principal) => (
        <>
          <PageHeader title="My workspace" description="Your current account and access." />
          <section className="workspace-profile">
            <h2>{principal.user.displayName}</h2>
            <dl>
              <div>
                <dt>Email</dt>
                <dd>{principal.user.email}</dd>
              </div>
              <div>
                <dt>Roles</dt>
                <dd>{principal.roles.join(", ").replaceAll("_", " ") || "No roles assigned"}</dd>
              </div>
              <div>
                <dt>Job title</dt>
                <dd>{principal.user.jobTitle || "Not recorded"}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </WorkspaceFrame>
  );
}
