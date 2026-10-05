import type { ReactNode } from "react";

export function BrandSignature({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-signature${compact ? " brand-signature--compact" : ""}`}>
      <strong className="brand-signature__product">AIRMECH ONE</strong>
      {!compact && (
        <span className="brand-signature__description">Operations Management System</span>
      )}
      <span className="brand-signature__attribution">Built by Qeilvra</span>
    </div>
  );
}

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`surface${className ? ` ${className}` : ""}`}>{children}</div>;
}

export type StatusTone = "info" | "success" | "warning" | "danger";

export function StatusBadge({ children, tone }: { children: ReactNode; tone: StatusTone }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
