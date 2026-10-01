import { readTableRanges } from "./table-ranges.js";

/**
 * Can this order type really be offered to a customer? It needs a mapping to a sales area that exists, and
 * a way to give the order a table: the zone's table ranges when the customer picks a table, otherwise a
 * fixed table or a range to allocate from. The kiosk's bootstrap and the platform's go-live checklist both
 * use this, so they can never disagree.
 */
export function isOrderTypeConfigured(args: {
  askTable: boolean;
  mapping: { fixedTableNumber?: number | null; tableRangeFrom?: number | null } | null | undefined;
  area: { tableRanges?: unknown } | null | undefined;
}): boolean {
  const { askTable, mapping, area } = args;
  const hasTableSource = askTable
    ? readTableRanges(area?.tableRanges).length > 0
    : Boolean(mapping?.fixedTableNumber || mapping?.tableRangeFrom);
  return Boolean(mapping && area && hasTableSource);
}
