"use client";

import { useState } from "react";
import {
  Button,
  Input,
  Select,
  Textarea,
  Checkbox,
  DatePicker,
  SearchField,
  PageHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  Pagination,
  DataTable,
  Modal,
  Drawer,
  Sheet,
  Tabs,
  StatusBadge,
} from "@airmech/ui";

// Explicit UI fixtures, with no business API, account data, metrics or permissions.
const specimens = [
  { id: "sample-a", name: "Component specimen A", status: "Ready" },
  { id: "sample-b", name: "Component specimen B", status: "Ready" },
];

export function UiPreview() {
  const [overlay, setOverlay] = useState<"modal" | "drawer" | "sheet" | null>(null);
  const [tab, setTab] = useState("controls");
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState(false);
  return (
    <main id="main-content" className="ui-preview">
      <PageHeader
        title="Shared component verification"
        description="Development specimens only. No operational records or account access."
      />
      <Tabs
        label="Component groups"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            id: "controls",
            label: "Controls",
            content: (
              <form
                className="ui-preview__form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSaved(true);
                }}
              >
                <Input
                  id="sample-name"
                  label="Sample name"
                  required
                  maxLength={120}
                  hint="Enter a component test value."
                />
                <Input
                  id="sample-error"
                  label="Invalid specimen"
                  error="This is the validation error specimen."
                />
                <Select id="sample-selection" label="Sample selection">
                  <option>Option A</option>
                  <option>Option B</option>
                </Select>
                <DatePicker id="sample-date" label="Sample date" />
                <Textarea id="sample-notes" label="Sample notes" maxLength={2000} />
                <SearchField id="sample-search" label="Sample search" />
                <Checkbox id="sample-checkbox" label="Enable specimen option" />
                <Button type="submit">Validate specimen</Button>
                {saved && <p role="status">Specimen validated locally; no data saved.</p>}
              </form>
            ),
          },
          {
            id: "records",
            label: "Records",
            content: (
              <>
                <DataTable
                  rows={specimens.slice(page - 1, page)}
                  rowKey={(row) => row.id}
                  caption="Component test specimens"
                  columns={[
                    { key: "name", label: "Name", render: (row) => row.name },
                    {
                      key: "status",
                      label: "Status",
                      render: (row) => <StatusBadge tone="info">{row.status}</StatusBadge>,
                    },
                  ]}
                />
                <Pagination page={page} pageCount={2} onPageChange={setPage} />
              </>
            ),
          },
          {
            id: "states",
            label: "States",
            content: (
              <div className="ui-preview__states">
                <EmptyState title="No component records">An empty-state specimen.</EmptyState>
                <ErrorState>
                  Safe error-state specimen. Retry is available to the caller.
                </ErrorState>
                <div role="status" aria-label="Loading specimen">
                  <Skeleton />
                </div>
              </div>
            ),
          },
        ]}
      />
      <div className="ui-preview__actions">
        <Button variant="secondary" onClick={() => setOverlay("modal")}>
          Open modal
        </Button>
        <Button variant="secondary" onClick={() => setOverlay("drawer")}>
          Open drawer
        </Button>
        <Button variant="secondary" onClick={() => setOverlay("sheet")}>
          Open sheet
        </Button>
        <Button busy>Busy specimen</Button>
      </div>
      <Modal
        open={overlay === "modal"}
        title="Modal specimen"
        onOpenChange={() => setOverlay(null)}
      >
        <Input id="modal-input" label="Modal input" />
      </Modal>
      <Drawer
        open={overlay === "drawer"}
        title="Drawer specimen"
        onOpenChange={() => setOverlay(null)}
      >
        <p>Drawer content specimen.</p>
      </Drawer>
      <Sheet
        open={overlay === "sheet"}
        title="Sheet specimen"
        onOpenChange={() => setOverlay(null)}
      >
        <p>Touch-friendly sheet content specimen.</p>
      </Sheet>
    </main>
  );
}
