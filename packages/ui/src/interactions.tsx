"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "./controls";

interface OverlayProps {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly onOpenChange: (open: boolean) => void;
}

function Overlay({
  open,
  title,
  children,
  onOpenChange,
  placement,
}: OverlayProps & { placement: "modal" | "drawer" | "sheet" }) {
  const reference = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = reference.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);
  return (
    <dialog
      ref={reference}
      tabIndex={-1}
      className={`ui-overlay ui-overlay--${placement}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const dialog = event.currentTarget;
        const controls = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "a[href], button, input, select, textarea, [tabindex]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== "hidden",
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === dialog)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <Button
          variant="secondary"
          aria-label={`Close ${title}`}
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </header>
      <div className="ui-overlay__body">{children}</div>
    </dialog>
  );
}

export function Modal(props: OverlayProps) {
  return <Overlay {...props} placement="modal" />;
}
export function Drawer(props: OverlayProps) {
  return <Overlay {...props} placement="drawer" />;
}
export function Sheet(props: OverlayProps) {
  return <Overlay {...props} placement="sheet" />;
}

interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

export function Tabs({
  items,
  value,
  onValueChange,
  label,
}: {
  items: readonly TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  label: string;
}) {
  const prefix = useId();
  const list = useRef<HTMLDivElement>(null);
  const active = items.find((item) => item.id === value);
  if (!active) throw new RangeError("Tabs require a selected item");
  return (
    <div className="ui-tabs">
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        onKeyDown={(event) => {
          const index = items.findIndex((item) => item.id === value);
          let next: number;
          if (event.key === "ArrowRight") next = (index + 1) % items.length;
          else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = items.length - 1;
          else return;
          event.preventDefault();
          const selected = items[next];
          if (selected) {
            onValueChange(selected.id);
            list.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
          }
        }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${prefix}-${item.id}`}
            aria-controls={`${prefix}-${item.id}-panel`}
            aria-selected={item.id === value}
            tabIndex={item.id === value ? 0 : -1}
            onClick={() => onValueChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        tabIndex={0}
        id={`${prefix}-${active.id}-panel`}
        aria-labelledby={`${prefix}-${active.id}`}
      >
        {active.content}
      </div>
    </div>
  );
}
