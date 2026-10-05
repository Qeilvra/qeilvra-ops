import type { ComponentProps, ReactNode } from "react";

type FieldProps = { id: string; label: string; error?: string; hint?: string };

function Field({ id, label, error, hint, children }: FieldProps & { children: ReactNode }) {
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <span id={`${id}-hint`} className="ui-field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="ui-field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function description({ id, error, hint }: FieldProps): string | undefined {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}

export function Button({
  children,
  variant = "primary",
  busy = false,
  disabled,
  type = "button",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger"; busy?: boolean }) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`ui-button ui-button--${variant} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({ label, error, hint, ...props }: ComponentProps<"input"> & FieldProps) {
  return (
    <Field id={props.id} label={label} {...(error ? { error } : {})} {...(hint ? { hint } : {})}>
      <input
        {...props}
        className={`ui-control ${props.className ?? ""}`}
        aria-invalid={!!error}
        aria-describedby={description({
          id: props.id,
          label,
          ...(error ? { error } : {}),
          ...(hint ? { hint } : {}),
        })}
      />
    </Field>
  );
}

export function Select({
  label,
  error,
  hint,
  children,
  ...props
}: ComponentProps<"select"> & FieldProps) {
  return (
    <Field id={props.id} label={label} {...(error ? { error } : {})} {...(hint ? { hint } : {})}>
      <select
        {...props}
        className={`ui-control ${props.className ?? ""}`}
        aria-invalid={!!error}
        aria-describedby={description({
          id: props.id,
          label,
          ...(error ? { error } : {}),
          ...(hint ? { hint } : {}),
        })}
      >
        {children}
      </select>
    </Field>
  );
}

export function Textarea({
  label,
  error,
  hint,
  ...props
}: ComponentProps<"textarea"> & FieldProps) {
  return (
    <Field id={props.id} label={label} {...(error ? { error } : {})} {...(hint ? { hint } : {})}>
      <textarea
        {...props}
        className={`ui-control ${props.className ?? ""}`}
        aria-invalid={!!error}
        aria-describedby={description({
          id: props.id,
          label,
          ...(error ? { error } : {}),
          ...(hint ? { hint } : {}),
        })}
      />
    </Field>
  );
}

export function Checkbox({
  label,
  id,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { id: string; label: string }) {
  return (
    <label className="ui-checkbox" htmlFor={id}>
      <input {...props} id={id} type="checkbox" />
      {label}
    </label>
  );
}

export function DatePicker(props: Omit<ComponentProps<typeof Input>, "type">) {
  return <Input {...props} type="date" />;
}

export function SearchField(props: Omit<ComponentProps<typeof Input>, "type">) {
  return <Input {...props} type="search" />;
}

export function PageHeader({
  title,
  description: detail,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="ui-state">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </section>
  );
}

export function ErrorState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-state ui-state--error" role="alert">
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ui-skeleton" aria-hidden="true">
      {Array.from({ length: Math.min(10, Math.max(1, lines)) }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(pageCount) ||
    page < 1 ||
    pageCount < 1 ||
    page > pageCount
  )
    throw new RangeError("Invalid pagination range");
  return (
    <nav className="ui-pagination" aria-label="Pagination">
      <Button variant="secondary" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </Button>
      <span aria-live="polite">
        Page {page} of {pageCount}
      </span>
      <Button
        variant="secondary"
        disabled={page === pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

export interface DataColumn<Row> {
  readonly key: string;
  readonly label: string;
  readonly render: (row: Row) => ReactNode;
}

/** Render one server-paginated page. Mobile uses labeled records, never a squeezed table. */
export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  caption,
  empty,
}: {
  rows: readonly Row[];
  columns: readonly DataColumn<Row>[];
  rowKey: (row: Row) => string;
  caption: string;
  empty?: ReactNode;
}) {
  if (rows.length > 100) throw new RangeError("DataTable requires a page of at most 100 records");
  if (!rows.length) return empty ?? <EmptyState title="No records" />;
  return (
    <div className="ui-records">
      <div className="ui-records__desktop">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column.key}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="ui-records__mobile" aria-label={caption}>
        <ul>
          {rows.map((row) => (
            <li key={rowKey(row)}>
              <dl>
                {columns.map((column) => (
                  <div key={column.key}>
                    <dt>{column.label}</dt>
                    <dd>{column.render(row)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
