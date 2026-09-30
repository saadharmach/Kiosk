import { BadRequestException, Injectable } from "@nestjs/common";
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

/** TpapiSalesArea.tableRanges is Json. Never trust its shape. */
function readRanges(value: unknown): TableRange[] {
  if (!Array.isArray(value)) return [];
  const out: TableRange[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    // The sync stores TPAPI's own shape. Delphi sends PascalCase on the wire;
    // the schema comment says camelCase. Accept either rather than guess.
    const from = Number(o.fromTable ?? o.FromTable);
    const to = Number(o.toTable ?? o.ToTable);
    if (Number.isFinite(from) && Number.isFinite(to)) out.push({ fromTable: from, toTable: to });
  }
  return out;
}

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

/**
 * Configuration that saves cleanly but fails at order time. Reported as
 * warnings rather than rejections, so a manager is never locked out of their
 * own settings screen by a rule inferred from ordering code.
 *
 * A free function, not a method: as a method its parameter types referenced
 * the return type of get(), which in turn depended on it.
 */
function audit(
  settings: SettingsPayload,
  orderTypes: OrderTypePayload[],
  areaById: Map<string, SalesAreaPayload>,
): SettingsWarning[] {
  const warnings: SettingsWarning[] = [];

  if (!settings.eatInEnabled && !settings.takeAwayEnabled && !settings.deliveryEnabled) {
    warnings.push({
      code: "NO_ORDER_TYPE",
      message: "No order type is enabled. The kiosk cannot take any order.",
    });
  }

  for (const ot of orderTypes) {
    if (!ot.isEnabled && !settings[FLAG_BY_TYPE[ot.orderType]]) continue;

    if (!ot.configured || !ot.salesAreaId) {
      warnings.push({
        code: "NOT_CONFIGURED",
        orderType: ot.orderType,
        message: `${ot.orderType} is enabled but has no sales area. Orders of this type will fail.`,
      });
      continue;
    }

    const area = areaById.get(ot.salesAreaId);
    if (!area) {
      warnings.push({
        code: "SALES_AREA_MISSING",
        orderType: ot.orderType,
        message: `${ot.orderType} points at sales area ${ot.salesAreaId}, which was not in the last unTill sync.`,
      });
      continue;
    }

    const asksCustomer = ot.orderType === "EAT_IN" && settings.askTableForEatIn;
    const hasFixed = ot.fixedTableNumber !== null;
    const hasRange = ot.tableRangeFrom !== null && ot.tableRangeTo !== null;

    if (asksCustomer && !hasRange && area.tableRanges.length === 0) {
      warnings.push({
        code: "NO_TABLE_RANGES",
        orderType: ot.orderType,
        message: `Customers are asked for a table number, but neither this order type nor sales area "${area.name}" defines a table range to validate it against. Every eat-in order will be rejected.`,
      });
    }

    if (!asksCustomer && !hasFixed && !hasRange) {
      warnings.push({
        code: "NO_TABLE_SOURCE",
        orderType: ot.orderType,
        message: `${ot.orderType} has neither a fixed table nor a table range, so there is no table to send the order to.`,
      });
    }

    if (hasFixed && hasRange) {
      warnings.push({
        code: "TWO_TABLE_SOURCES",
        orderType: ot.orderType,
        message: `${ot.orderType} has both a fixed table and a range. Only one is used — clear the other so the behaviour is explicit.`,
      });
    }

    // unTill rejects a table that no sales-area range covers (ReturnCode 7).
    if (area.tableRanges.length > 0) {
      const covered = (from: number, to: number) =>
        area.tableRanges.some((r) => r.fromTable <= from && to <= r.toTable);
      const outside: string[] = [];
      if (hasFixed && !covered(ot.fixedTableNumber!, ot.fixedTableNumber!)) {
        outside.push(`table ${ot.fixedTableNumber}`);
      }
      if (hasRange && !covered(ot.tableRangeFrom!, ot.tableRangeTo!)) {
        outside.push(`tables ${ot.tableRangeFrom}-${ot.tableRangeTo}`);
      }
      if (outside.length > 0) {
        warnings.push({
          code: "TABLE_OUTSIDE_SALES_AREA",
          orderType: ot.orderType,
          message: `${ot.orderType} sends orders to ${outside.join(" and ")}, which sales area "${area.name}" does not define. unTill will reject every order of this type.`,
        });
      }
    }

    if (!ot.tablePart) {
      warnings.push({
        code: "DEFAULT_TABLE_PART",
        orderType: ot.orderType,
        message: `${ot.orderType} has no table part set; "a" is used.`,
      });
    }
  }

  return warnings;
}