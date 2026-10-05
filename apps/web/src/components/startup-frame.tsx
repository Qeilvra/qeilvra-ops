import { BrandSignature } from "@airmech/ui";
import type { ReactNode } from "react";

export function StartupFrame({ children }: { children: ReactNode }) {
  return (
    <div className="startup-frame">
      <header className="startup-header">
        <div className="startup-header-inner">
          <BrandSignature />
          <span className="workspace-label">Airmech Oman</span>
        </div>
      </header>
      <main className="startup-main" id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="startup-footer">
        <span>Operations Management System</span>
        <span>Built by Qeilvra</span>
      </footer>
    </div>
  );
}
