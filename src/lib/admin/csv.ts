/**
 * CSV for the admin exports. A cell starting with =, +, -, @, a tab or a
 * carriage return is prefixed with ' so a spreadsheet never runs it as a
 * formula; quotes, commas and line breaks are quoted.
 */
export function toCsv(head: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : String(v ?? "");
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [head.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n") + "\n";
}

export function csvResponse(body: string, name: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agental-${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
