import { Surface } from "@airmech/ui";

import { StartupFrame } from "@/components/startup-frame";

export default function Loading() {
  return (
    <StartupFrame>
      <Surface className="feedback-panel">
        <p className="eyebrow">Airmech One</p>
        <h1>Loading the workspace</h1>
        <p role="status">Preparing the current screen. Please wait.</p>
        <div className="loading-placeholder" aria-hidden="true" />
      </Surface>
    </StartupFrame>
  );
}
