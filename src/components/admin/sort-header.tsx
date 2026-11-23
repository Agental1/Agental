import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * A table header that sorts by its column: a click sorts by it, a second
 * click flips the order. Keeps every other filter in the query, drops the page.
 */
export function SortHeader({
  label,
  column,
  base,
  query,
  current,
  dir,
  title,
}: {
  label: string;
  column: string;
  base: string;
  query: URLSearchParams;
  current?: string;
  dir?: "asc" | "desc";
  title?: string;
}) {
  const q = new URLSearchParams(query);
  q.delete("page");
  const active = current === column;
  q.set("sort", column);
  q.set("dir", active && dir === "asc" ? "desc" : "asc");
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="p-3 font-medium" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined} title={title}>
      <Link href={`${base}?${q.toString()}`} className="inline-flex items-center gap-1 hover:text-fg">
        {label}
        <Icon className={`size-3 ${active ? "text-accent" : "opacity-50"}`} aria-hidden />
      </Link>
    </th>
  );
}
