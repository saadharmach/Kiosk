export interface TableRange {
  fromTable: number;
  toTable: number;
}

/**
 * TpapiSalesArea.tableRanges is Json. Never trust its shape. The sync stores TPAPI's
 * own shape: Delphi sends PascalCase on the wire while the schema comment says
 * camelCase, so accept either rather than guess.
 */
export function readTableRanges(value: unknown): TableRange[] {
  if (!Array.isArray(value)) return [];
  const out: TableRange[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const from = Number(o.fromTable ?? o.FromTable);
    const to = Number(o.toTable ?? o.ToTable);
    if (Number.isFinite(from) && Number.isFinite(to)) out.push({ fromTable: from, toTable: to });
  }
  return out;
}

export const tableInRanges = (n: number, ranges: TableRange[]): boolean =>
  ranges.some((r) => n >= r.fromTable && n <= r.toTable);
