import { BadRequestException, Injectable } from "@nestjs/common";
import { readTableRanges } from "../common/table-ranges.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateSettingsDto } from "./dto/settings.dto.js";

export const ORDER_TYPES = ["EAT_IN", "TAKE_AWAY", "DELIVERY"] as const;
export type OrderTypeName = (typeof ORDER_TYPES)[number];

type FlagName = "eatInEnabled" | "takeAwayEnabled" | "deliveryEnabled";

const FLAG_BY_TYPE: Record<OrderTypeName, FlagName> = {
  EAT_IN: "eatInEnabled",
  TAKE_AWAY: "takeAwayEnabled",
  DELIVERY: "deliveryEnabled",
};

export interface TableRange { fromTable: number; toTable: number }

export interface SettingsPayload {
  eatInEnabled: boolean;
  takeAwayEnabled: boolean;
  deliveryEnabled: boolean;
  askTableForEatIn: boolean;
  kioskIdleTimeoutSec: number;
  kioskResetDelaySec: number;
  showAllergens: boolean;
  showProductImages: boolean;
  ticketFooterText: string | null;
}

export interface OrderTypePayload {
  orderType: OrderTypeName;
  configured: boolean;
  isEnabled: boolean;
  salesAreaId: string | null;
  fixedTableNumber: number | null;
  tableRangeFrom: number | null;
  tableRangeTo: number | null;
  tablePart: string | null;
}

export interface SalesAreaPayload {
  untillId: string;
  number: number;
  name: string;
  tableRanges: TableRange[];
}

export interface SettingsWarning {
  code: string;
  /** error: the kiosk will not offer it, or unTill will refuse its orders. warning: works, not as meant. info. */
  severity: "error" | "warning" | "info";
  orderType?: OrderTypeName;
  message: string;
}

export interface SettingsResponse {
  settings: SettingsPayload;
  orderTypes: OrderTypePayload[];
  salesAreas: SalesAreaPayload[];
  warnings: SettingsWarning[];
}

/** Mirrors the @default() values in schema.prisma. */
const SETTINGS_DEFAULTS: SettingsPayload = {
  eatInEnabled: true,
  takeAwayEnabled: false,
  deliveryEnabled: false,
  askTableForEatIn: true,
  kioskIdleTimeoutSec: 90,
  kioskResetDelaySec: 15,
  showAllergens: false,
  showProductImages: true,
  ticketFooterText: null,
};

const readRanges = (value: unknown): TableRange[] => readTableRanges(value);

/** undefined = field not sent, keep what is stored. null = clear it. */
function pick<T>(sent: T | undefined | null, existing: T | null): T | null {
  return sent === undefined ? existing : sent;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(restaurantId: string): Promise<SettingsResponse> {
    const [row, mappings, areas] = await Promise.all([
      this.prisma.restaurantSettings.findUnique({ where: { restaurantId } }),
      this.prisma.orderTypeMapping.findMany({ where: { restaurantId } }),
      this.prisma.tpapiSalesArea.findMany({
        where: { restaurantId, isActive: true },
        orderBy: { number: "asc" },
      }),
    ]);

    const settings: SettingsPayload = row
      ? {
          eatInEnabled: row.eatInEnabled,
          takeAwayEnabled: row.takeAwayEnabled,
          deliveryEnabled: row.deliveryEnabled,
          askTableForEatIn: row.askTableForEatIn,
          kioskIdleTimeoutSec: row.kioskIdleTimeoutSec,
          kioskResetDelaySec: row.kioskResetDelaySec,
          showAllergens: row.showAllergens,
          showProductImages: row.showProductImages,
          ticketFooterText: row.ticketFooterText,
        }
      : { ...SETTINGS_DEFAULTS };

    const salesAreas: SalesAreaPayload[] = areas.map((a) => ({
      untillId: a.untillId.toString(),
      number: a.number,
      name: a.name,
      tableRanges: readRanges(a.tableRanges),
    }));
    const areaById = new Map<string, SalesAreaPayload>(salesAreas.map((a) => [a.untillId, a]));

    const byType = new Map(mappings.map((m) => [m.orderType as OrderTypeName, m]));
    const orderTypes: OrderTypePayload[] = ORDER_TYPES.map((t) => {
      const m = byType.get(t);
      return {
        orderType: t,
        configured: Boolean(m),
        isEnabled: m?.isEnabled ?? false,
        salesAreaId: m ? m.salesAreaId.toString() : null,
        fixedTableNumber: m?.fixedTableNumber ?? null,
        tableRangeFrom: m?.tableRangeFrom ?? null,
        tableRangeTo: m?.tableRangeTo ?? null,
        tablePart: m?.tablePart ?? null,
      };
    });

    return { settings, orderTypes, salesAreas, warnings: audit(settings, orderTypes, areaById) };
  }

  async update(restaurantId: string, dto: UpdateSettingsDto): Promise<SettingsResponse> {
    const [row, mappings, areas] = await Promise.all([
      this.prisma.restaurantSettings.findUnique({ where: { restaurantId } }),
      this.prisma.orderTypeMapping.findMany({ where: { restaurantId } }),
      this.prisma.tpapiSalesArea.findMany({
        where: { restaurantId, isActive: true },
        select: { untillId: true },
      }),
    ]);

    const activeAreaIds = new Set(areas.map((a) => a.untillId.toString()));
    const current = new Map(mappings.map((m) => [m.orderType as OrderTypeName, m]));

    const seen = new Set<OrderTypeName>();
    const writes: {
      orderType: OrderTypeName;
      salesAreaId: bigint;
      fixedTableNumber: number | null;
      tableRangeFrom: number | null;
      tableRangeTo: number | null;
      tablePart: string | null;
      isEnabled: boolean;
    }[] = [];

    for (const item of dto.orderTypes ?? []) {
      const t = item.orderType as OrderTypeName;
      if (seen.has(t)) throw new BadRequestException(`${t} appears twice in the request.`);
      seen.add(t);

      const cur = current.get(t);

      const salesAreaId = item.salesAreaId ?? (cur ? cur.salesAreaId.toString() : undefined);
      if (!salesAreaId) {
        throw new BadRequestException(`${t}: choose a sales area before saving.`);
      }
      if (!activeAreaIds.has(salesAreaId)) {
        throw new BadRequestException(
          `${t}: sales area ${salesAreaId} is not an active sales area for this restaurant. Run a catalog sync, or pick another.`,
        );
      }

      const fixedTableNumber = pick(item.fixedTableNumber, cur?.fixedTableNumber ?? null);
      const tableRangeFrom = pick(item.tableRangeFrom, cur?.tableRangeFrom ?? null);
      const tableRangeTo = pick(item.tableRangeTo, cur?.tableRangeTo ?? null);
      const tablePart = pick(item.tablePart, cur?.tablePart ?? null);
      const isEnabled = item.isEnabled ?? cur?.isEnabled ?? false;

      if ((tableRangeFrom === null) !== (tableRangeTo === null)) {
        throw new BadRequestException(`${t}: set both ends of the table range, or neither.`);
      }
      if (tableRangeFrom !== null && tableRangeTo !== null && tableRangeFrom > tableRangeTo) {
        throw new BadRequestException(
          `${t}: table range starts at ${tableRangeFrom} and ends at ${tableRangeTo}.`,
        );
      }
      if (tablePart !== null && !/^[a-f]$/.test(tablePart)) {
        throw new BadRequestException(`${t}: table part must be a single lowercase letter a-f.`);
      }

      writes.push({
        orderType: t,
        salesAreaId: BigInt(salesAreaId),
        fixedTableNumber,
        tableRangeFrom,
        tableRangeTo,
        tablePart,
        isEnabled,
      });
    }

    // One switch per order type: the card's isEnabled is the source of truth and
    // the RestaurantSettings flag is kept in step with it, so the two can never
    // disagree about whether the kiosk offers that order type.
    const flags: Record<FlagName, boolean> = {
      eatInEnabled: row?.eatInEnabled ?? SETTINGS_DEFAULTS.eatInEnabled,
      takeAwayEnabled: row?.takeAwayEnabled ?? SETTINGS_DEFAULTS.takeAwayEnabled,
      deliveryEnabled: row?.deliveryEnabled ?? SETTINGS_DEFAULTS.deliveryEnabled,
    };
    for (const w of writes) flags[FLAG_BY_TYPE[w.orderType]] = w.isEnabled;

    if (!flags.eatInEnabled && !flags.takeAwayEnabled && !flags.deliveryEnabled) {
      throw new BadRequestException(
        "At least one order type must stay enabled, otherwise the kiosk cannot take any order.",
      );
    }

    const s = dto.settings ?? {};
    const settingsData = {
      ...(s.askTableForEatIn !== undefined ? { askTableForEatIn: s.askTableForEatIn } : {}),
      ...(s.kioskIdleTimeoutSec !== undefined ? { kioskIdleTimeoutSec: s.kioskIdleTimeoutSec } : {}),
      ...(s.kioskResetDelaySec !== undefined ? { kioskResetDelaySec: s.kioskResetDelaySec } : {}),
      ...(s.showAllergens !== undefined ? { showAllergens: s.showAllergens } : {}),
      ...(s.showProductImages !== undefined ? { showProductImages: s.showProductImages } : {}),
      ...(s.ticketFooterText !== undefined
        ? { ticketFooterText: s.ticketFooterText?.trim() || null }
        : {}),
      ...flags,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantSettings.upsert({
        where: { restaurantId },
        create: { restaurantId, ...SETTINGS_DEFAULTS, ...settingsData },
        update: settingsData,
      });

      for (const w of writes) {
        await tx.orderTypeMapping.upsert({
          where: { restaurantId_orderType: { restaurantId, orderType: w.orderType } },
          create: { restaurantId, ...w },
          update: {
            salesAreaId: w.salesAreaId,
            fixedTableNumber: w.fixedTableNumber,
            tableRangeFrom: w.tableRangeFrom,
            tableRangeTo: w.tableRangeTo,
            tablePart: w.tablePart,
            isEnabled: w.isEnabled,
          },
        });
      }
    });

    return this.get(restaurantId);
  }
}

const LABEL: Record<OrderTypeName, string> = { EAT_IN: "Eat in", TAKE_AWAY: "Take away", DELIVERY: "Delivery" };

/** "1–25, 30–48 and 50–60". */
const listRanges = (ranges: TableRange[]) => {
  const parts = ranges.map((r) => (r.fromTable === r.toTable ? `${r.fromTable}` : `${r.fromTable}–${r.toTable}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "none");
};

/** The numbers from..to that none of the sales area's ranges contains, as ranges. */
export function uncovered(from: number, to: number, ranges: TableRange[]): TableRange[] {
  const out: TableRange[] = [];
  let n = from;
  while (n <= to) {
    const r = ranges.find((x) => x.fromTable <= n && n <= x.toTable);
    if (r) { n = r.toTable + 1; continue; }
    // Up to the next range that starts inside, or the end.
    const next = Math.min(to + 1, ...ranges.map((x) => x.fromTable).filter((f) => f > n));
    out.push({ fromTable: n, toTable: next - 1 });
    n = next;
  }
  return out;
}

/**
 * Configuration that saves cleanly but fails at order time. Reported as
 * warnings rather than rejections, so a manager is never locked out of their
 * own settings screen by a rule inferred from ordering code.
 *
 * "error": the kiosk will not offer this way of ordering, or unTill will refuse its orders.
 * "warning": it works, but not quite as meant. "info": good to know.
 *
 * A free function, not a method: as a method its parameter types referenced
 * the return type of get(), which in turn depended on it.
 */
export function audit(
  settings: SettingsPayload,
  orderTypes: OrderTypePayload[],
  areaById: Map<string, SalesAreaPayload>,
): SettingsWarning[] {
  const warnings: SettingsWarning[] = [];

  if (!settings.eatInEnabled && !settings.takeAwayEnabled && !settings.deliveryEnabled) {
    warnings.push({
      code: "NO_ORDER_TYPE", severity: "error",
      message: "No way of ordering is switched on, so the kiosk cannot take any order. Switch on Eat in or Take away below.",
    });
  }

  for (const ot of orderTypes) {
    if (!ot.isEnabled && !settings[FLAG_BY_TYPE[ot.orderType]]) continue;
    const label = LABEL[ot.orderType];

    if (!ot.configured || !ot.salesAreaId) {
      warnings.push({
        code: "NOT_CONFIGURED", severity: "error", orderType: ot.orderType,
        message: `${label} is switched on but has no sales area, so the kiosk does not offer it. Choose its sales area.`,
      });
      continue;
    }

    const area = areaById.get(ot.salesAreaId);
    if (!area) {
      warnings.push({
        code: "SALES_AREA_MISSING", severity: "error", orderType: ot.orderType,
        message: `${label}: the sales area chosen for it is no longer in unTill (unTill's setup or the connection to it changed), so the kiosk does not offer ${label}. Choose one of the current sales areas, and check the table numbers too.`,
      });
      continue;
    }

    const asksCustomer = ot.orderType === "EAT_IN" && settings.askTableForEatIn;
    const hasFixed = ot.fixedTableNumber !== null;
    const hasRange = ot.tableRangeFrom !== null && ot.tableRangeTo !== null;

    if (asksCustomer && !hasRange && area.tableRanges.length === 0) {
      warnings.push({
        code: "NO_TABLE_RANGES", severity: "error", orderType: ot.orderType,
        message: `Customers are asked for their table number, but neither ${label} nor sales area "${area.name}" says which tables exist, so every number would be refused. Set the lowest and highest table number.`,
      });
    }

    if (!asksCustomer && !hasFixed && !hasRange) {
      warnings.push({
        code: "NO_TABLE_SOURCE", severity: "error", orderType: ot.orderType,
        message: `${label} has no table to send its orders to: set a range of numbers for the kiosk to hand out (or one fixed table).`,
      });
    }

    if (hasFixed && hasRange) {
      warnings.push({
        code: "TWO_TABLE_SOURCES", severity: "warning", orderType: ot.orderType,
        message: `${label} has both a fixed table and a range. Only one is used — clear the other so it is clear which.`,
      });
    }

    // unTill refuses a table that no range of the sales area contains (ReturnCode 7).
    if (area.tableRanges.length > 0) {
      const has = `Sales area "${area.name}" has tables ${listRanges(area.tableRanges)}.`;
      if (hasFixed && uncovered(ot.fixedTableNumber!, ot.fixedTableNumber!, area.tableRanges).length) {
        warnings.push({
          code: "TABLE_OUTSIDE_SALES_AREA", severity: "error", orderType: ot.orderType,
          message: `${label} sends its orders to table ${ot.fixedTableNumber}, which unTill does not have, so it will refuse them. ${has}`,
        });
      }
      if (hasRange) {
        const missing = uncovered(ot.tableRangeFrom!, ot.tableRangeTo!, area.tableRanges);
        const all = missing.length === 1 && missing[0]!.fromTable === ot.tableRangeFrom && missing[0]!.toTable === ot.tableRangeTo;
        if (missing.length) {
          warnings.push({
            code: "TABLE_OUTSIDE_SALES_AREA", severity: "error", orderType: ot.orderType,
            message: all
              ? `${label} uses tables ${ot.tableRangeFrom}–${ot.tableRangeTo}, none of which unTill has, so it will refuse every order. ${has}`
              : `${label} uses tables ${ot.tableRangeFrom}–${ot.tableRangeTo}, but unTill has no ${listRanges(missing)}: an order given one of those numbers will be refused. ${has}`,
          });
        }
      }
    }

    if (!ot.tablePart) {
      warnings.push({
        code: "DEFAULT_TABLE_PART", severity: "info", orderType: ot.orderType,
        message: `${label} has no table part set; "a" (the main bill) is used.`,
      });
    }
  }

  return warnings;
}
