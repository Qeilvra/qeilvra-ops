import { StatusBadge, Surface } from "@airmech/ui";
import Link from "next/link";

import { StartupFrame } from "@/components/startup-frame";

export default function NotFound() {
  return (
    <StartupFrame>
      <Surface className="feedback-panel">
        <StatusBadge tone="warning">Page unavailable</StatusBadge>
        <h1>This page is not available</h1>
        <p>
          Check the address or return to the workspace. Operational modules will become available as
          setup progresses.
        </p>
        <div className="feedback-actions">
          <Link className="action-button" href="/">
            Return to workspace
          </Link>
        </div>
      </Surface>
    </StartupFrame>
  );
}
