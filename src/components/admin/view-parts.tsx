import { Link } from "@/i18n/navigation";

/** Shared pieces of the admin data views: a filter bar and a plain table. */
export const field = "h-10 rounded-sedan border border-border bg-surface px-2 text-sm";

export function FilterBar({
  children,
  csvHref,
  filterLabel,
  csvLabel,
}: {
  children: React.ReactNode;
  csvHref: string;
  filterLabel: string;
  csvLabel: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      {children}
      <button className="h-10 rounded-sedan bg-accent px-4 text-sm font-bold text-[var(--accent-fg)]">{filterLabel}</button>
      <a href={csvHref} className="h-10 content-center px-2 text-sm font-bold text-accent hover:underline">
        {csvLabel}
      </a>
    </form>
  );
}

export function Table({ head, children, minWidth = 900 }: { head: string[]; children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-sedan border border-border">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="bg-surface-2 text-left text-fg-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="p-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function AccountLink({ id, label }: { id: string; label: string }) {
  return (
    <Link href={`/admin/comptes/${id}`} className="font-bold text-accent hover:underline">
      {label}
    </Link>
  );
}

/** The query string of the current filters, for the CSV link. */
export function qs(f: object): string {
  const s = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `?${s}` : "";
}
