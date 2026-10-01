import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { TpapiClientFactory } from "../common/tpapi-client.factory.js";
import { TpapiClient, TpapiTransportError } from "@kiosk/tpapi";

type Extra = { Key: string; Value: string; Extra?: Extra[] };
type Row = Record<string, unknown>;

const bi = (v: unknown): bigint => BigInt(String(v ?? 0));
const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string => String(v ?? "");

/** Extra[] → Map for quick key lookup. */
function extraMap(list?: Extra[]): Map<string, Extra> {
  return new Map((list ?? []).map((e) => [e.Key, e]));
}

/** "5000000100:3" or "100:2,200:1" → Map<optionGroupId, requiredChoices> */
function parseComposedOptions(value?: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of (value ?? "").split(/[;,]/)) {
    const [id, count] = part.split(":");
    if (id?.trim() && count?.trim()) out.set(id.trim(), Number(count));
  }
  return out;
}

/** A sync that started longer ago than this and never finished is taken to have died with the server. */
export const SYNC_STALE_MIN = 10;

type Delegate = { deleteMany: (a: unknown) => Promise<unknown>; createMany: (a: unknown) => Promise<unknown> };

/**
 * Writes every table's new rows in ONE transaction. The kiosk keeps reading the old menu until the whole new
 * one is in place (an empty or half-replaced menu is never visible), and if anything fails nothing changes.
 */
export async function replaceAllAtomically(
  prisma: { $transaction: (fn: (tx: unknown) => Promise<void>, opts?: { maxWait?: number; timeout?: number }) => Promise<void> },
  restaurantId: string,
  pending: [table: string, rows: Row[]][],
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      for (const [table, rows] of pending) {
        const delegate = (tx as Record<string, Delegate>)[table]!;
        await delegate.deleteMany({ where: { restaurantId } });
        for (let i = 0; i < rows.length; i += 500) {
          await delegate.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
        }
      }
    },
    // Many small inserts over a slow link can take a while; far longer than the default 5 seconds.
    { maxWait: 15_000, timeout: 180_000 },
  );
}

@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: TpapiClientFactory,
  ) {}

  async run(restaurantId: string, trigger: "MANUAL" | "SCHEDULED" | "STARTUP" = "MANUAL") {
    // Two syncs of one restaurant at once would fight over the same rows (a double click, or the
    // scheduler meeting a manual run), so the second is refused.
    const alreadyRunning = await this.prisma.syncRun.findFirst({
      where: { restaurantId, status: "RUNNING", startedAt: { gt: new Date(Date.now() - SYNC_STALE_MIN * 60_000) } },
      select: { id: true },
    });
    if (alreadyRunning) throw new ConflictException("A sync is already running for this restaurant");

    const correlationId = randomUUID();
    const startedAt = Date.now();
    // What the run learns is held here and written together at the end (see replaceAllAtomically).
    const pending: [string, Row[]][] = [];
    const queue = (table: string, rows: Row[]) => { pending.push([table, rows]); };
    const run = await this.prisma.syncRun.create({
      data: { restaurantId, trigger, correlationId, status: "RUNNING" },
      select: { id: true },
    });

    const stats: Record<string, number> = {};
    const anomalies: string[] = [];

    try {
      const { client, endpoint } = await this.clients.forRestaurant(restaurantId);
      this.logger.log(`Sync ${restaurantId} via ${endpoint}`);
      const call = <T = Record<string, unknown>>(op: string, args: Row = {}) =>
        this.tracedCall<T>(client, restaurantId, correlationId, op, args);

      // ---------------------------------------------------------- global data
      const salesAreasRes = await call<{ SalesAreas: Row[] }>("GetSalesAreasInfo");
      const salesAreas = salesAreasRes.SalesAreas ?? [];
      queue("tpapiSalesArea",
        salesAreas.map((a) => ({
          restaurantId,
          untillId: bi(a.SalesAreaId),
          number: num(a.SalesAreaNumber),
          name: str(a.SalesAreaName),
          priceLevelId: bi(a.PriceId),
          tableRanges: (a.Tables ?? []) as never,
        })));
      stats.salesAreas = salesAreas.length;

      const prices = (await call<{ Prices: Row[] }>("GetPricesInfo")).Prices ?? [];
      queue("tpapiPriceLevel",
        prices.map((p) => ({
          restaurantId, untillId: bi(p.PriceId), name: str(p.PriceName), hqId: str(p.HqId) || null,
        })));
      stats.priceLevels = prices.length;

      const categories = (await call<{ Categories: Row[] }>("GetCategoriesInfo")).Categories ?? [];
      queue("tpapiCategory",
        categories.map((c) => ({
          restaurantId, untillId: bi(c.CategoryId), name: str(c.CategoryName), hqId: str(c.HqId) || null,
        })));
      stats.categories = categories.length;

      const groups = (await call<{ Groups: Row[] }>("GetGroupsInfo")).Groups ?? [];
      queue("tpapiGroup",
        groups.map((g) => ({
          restaurantId, untillId: bi(g.GroupId), name: str(g.GroupName),
          categoryId: bi(g.CategoryId), hqId: str(g.HqId) || null,
        })));
      stats.groups = groups.length;

      const sizeMods = (await call<{ SizeModifiers: Row[] }>("GetSizeModifiersInfo")).SizeModifiers ?? [];
      queue("tpapiSizeModifier",
        sizeMods.map((s) => ({
          restaurantId, untillId: bi(s.Id), number: num(s.Number),
          name: str(s.Name), isActive: Boolean(s.IsActive),
        })));
      queue("tpapiSizeModifierItem",
        sizeMods.flatMap((s) => ((s.Items ?? []) as Row[]).map((i) => ({
          restaurantId, untillId: bi(i.Id), sizeModifierId: bi(s.Id),
          number: num(i.Number), name: str(i.Name), isActive: Boolean(i.IsActive),
        }))));
      stats.sizeModifiers = sizeMods.length;

      const allergens = (await call<{ Allergens: Row[] }>("GetAllergensInfo")).Allergens ?? [];
      queue("tpapiAllergen",
        allergens.map((a) => ({
          restaurantId, untillId: bi(a.Id), number: num(a.Number), name: str(a.Name),
          description: str(a.Description) || null, isActive: Boolean(a.IsActive),
        })));
      stats.allergens = allergens.length;

      const courses = (await call<{ Courses: Row[] }>("GetCourses")).Courses ?? [];
      queue("tpapiCourse",
        courses.map((c) => ({
          restaurantId, untillId: bi(c.Id), number: num(c.Number), name: str(c.Name),
          separate: Boolean(c.Separate), autoFire: Boolean(c.AutoFire),
        })));
      stats.courses = courses.length;

      const payments = (await call<{ Payments: Row[] }>("GetPaymentsInfo")).Payments ?? [];
      queue("tpapiPayment",
        payments.map((p) => ({
          restaurantId, untillId: bi(p.PaymentId), number: num(p.PaymentNumber),
          name: str(p.PaymentName), kind: num(p.PaymentKind),
        })));
      stats.payments = payments.length;

      const printers = (await call<{ Printers: Row[] }>("GetPrintersInfo")).Printers ?? [];
      queue("tpapiPrinter",
        printers.map((p) => ({
          restaurantId, untillId: bi(p.Id), name: str(p.Name),
          guid: str(p.Guid) || null, nullPrinter: Boolean(p.NullPrinter),
        })));
      stats.printers = printers.length;

      // ------------------------------------------------- per sales area data
      const departments = new Map<string, Row>();
      const articles = new Map<string, Row>();
      const articlePrices: Row[] = [];
      const sizePrices: Row[] = [];
      const articleOptions = new Map<string, Row>();
      const optionGroups = new Map<string, Row>();
      const optionItems = new Map<string, Row>();

      for (const area of salesAreas) {
        const salesAreaId = num(area.SalesAreaId);

        for (const d of (await call<{ Departments: Row[] }>("GetDepartmentsInfo",
          { SalesAreaId: salesAreaId, DepartmentId: 0 })).Departments ?? []) {
          departments.set(str(d.DepartmentId), {
            restaurantId, untillId: bi(d.DepartmentId), number: num(d.DepartmentNumber),
            name: str(d.DepartmentName), groupId: bi(d.GroupId),
            supplementOptionId: d.Supplement ? bi(d.Supplement) : null,
            condimentOptionId: d.Condiment ? bi(d.Condiment) : null,
            availableSalesAreaIds: ((d.Available ?? []) as unknown[]).map(bi),
            hqId: str(d.HqId) || null,
          });
        }

        for (const g of (await call<{ Options: Row[] }>("GetOptionsInfo",
          { SalesAreaId: salesAreaId, OptionId: 0 })).Options ?? []) {
          const items = (g.Items ?? []) as Row[];
          optionGroups.set(str(g.OptionId), {
            restaurantId, untillId: bi(g.OptionId), name: str(g.OptionName),
            availableSalesAreaIds: ((g.Available ?? []) as unknown[]).map(bi),
            itemCount: new Set(items.map((i) => str(i.ArticleId))).size,
          });
          if (items.length === 0) anomalies.push(`option group ${g.OptionId} "${g.OptionName}" has no items`);
          for (const i of items) {
            optionItems.set(`${g.OptionId}:${i.ArticleId}:${i.PriceId}`, {
              restaurantId, optionGroupId: bi(g.OptionId), articleId: bi(i.ArticleId),
              priceLevelId: bi(i.PriceId), amount: num(i.Amount), vat: num(i.Vat),
            });
          }
        }

        for (const a of (await call<{ Articles: Row[] }>("GetArticlesInfo",
          { SalesAreaId: salesAreaId, ArticleId: 0, GetInactive: false })).Articles ?? []) {
          const key = str(a.ArticleId);
          const ex = extraMap(a.Extra as Extra[]);
          const composed = parseComposedOptions(ex.get("composed_options")?.Value);

          if (!articles.has(key)) {
            const sizeModifierId = ex.get("size_modifier_id")?.Value;
            articles.set(key, {
              restaurantId, untillId: bi(a.ArticleId), number: num(a.ArticleNumber),
              name: str(a.ArticleName), departmentId: bi(a.DepartmentId),
              availableSalesAreaIds: ((a.Available ?? []) as unknown[]).map(bi),
              isMenu: Boolean(a.IsMenu), isManualPrice: Boolean(a.IsManualPrice),
              isActive: Boolean(a.IsActive), promo: Boolean(a.Promo),
              plu: ex.get("plu")?.Value || null,
              courseId: ex.get("course_id")?.Value ? bi(ex.get("course_id")!.Value) : null,
              sizeModifierId: sizeModifierId ? bi(sizeModifierId) : null,
              externalId: ex.get("external_id")?.Value || null,
              hqId: str(a.HqId) || null,
              rawExtra: (a.Extra ?? []) as never,
              isPresent: true,
            });

            const priceRows = (a.Prices ?? []) as Row[];
            for (const p of priceRows) {
              articlePrices.push({
                restaurantId, articleId: bi(a.ArticleId), priceLevelId: bi(p.PriceId),
                amount: num(p.Amount), vat: num(p.Vat),
              });
              // sizes live in the price's own Extra
              const sizes = extraMap(p.Extra as Extra[]).get("size_modifiers")?.Extra ?? [];
              for (const s of sizes) {
                sizePrices.push({
                  restaurantId, articleId: bi(a.ArticleId), priceLevelId: bi(p.PriceId),
                  sizeItemId: bi(s.Key), amount: Number(s.Value),
                });
              }
            }

            // anomaly rules from the data we analysed
            if (priceRows.length === 0 && !a.IsMenu) {
              anomalies.push(`article ${a.ArticleId} "${a.ArticleName}" has no price and is not a menu`);
            }
            if (sizeModifierId && sizePrices.filter((s) => s.articleId === bi(a.ArticleId)).length === 0) {
              anomalies.push(`article ${a.ArticleId} has a size modifier but no size prices`);
            }
          }

          const freeOption = str(a.FreeOption);
          for (const optId of ((a.Options ?? []) as unknown[]).map(str)) {
            articleOptions.set(`${key}:${optId}`, {
              restaurantId, articleId: bi(a.ArticleId), optionGroupId: bi(optId),
              requiredChoices: composed.get(optId) ?? null,
              isFreeOption: freeOption !== "0" && freeOption === optId,
              sortOrder: 0,
            });
          }
        }
      }

      queue("tpapiDepartment", [...departments.values()]);
      queue("tpapiOptionGroup", [...optionGroups.values()]);
      queue("tpapiOptionItem", [...optionItems.values()]);
      queue("tpapiArticle", [...articles.values()]);
      queue("tpapiArticlePrice", articlePrices);
      queue("tpapiArticleSizePrice", sizePrices);
      queue("tpapiArticleOption", [...articleOptions.values()]);

      // Everything the till said, in one go. Until this commits the kiosk still has the previous menu.
      await replaceAllAtomically(this.prisma as never, restaurantId, pending);

      stats.departments = departments.size;
      stats.articles = articles.size;
      stats.articlePrices = articlePrices.length;
      stats.articleSizePrices = sizePrices.length;
      stats.optionGroups = optionGroups.size;
      stats.optionItems = optionItems.size;
      stats.articleOptions = articleOptions.size;

      const durationMs = Date.now() - startedAt;
      await this.prisma.tpapiConnection.update({
        where: { restaurantId },
        data: { lastSyncAt: new Date(), lastSuccessAt: new Date() },
      });
      const finished = await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: anomalies.length ? "PARTIAL" : "SUCCESS",
          finishedAt: new Date(),
          durationMs,
          stats: { ...stats, anomalies: anomalies.slice(0, 100), anomalyCount: anomalies.length } as never,
        },
      });

      this.logger.log(`Sync done in ${durationMs}ms: ${JSON.stringify(stats)}`);
      return finished;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Sync failed: ${message}`);
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          errorMessage: message,
          stats: { ...stats, anomalyCount: anomalies.length } as never,
        },
      });
      await this.prisma.integrationLog.create({
        data: {
          restaurantId, kind: "TPAPI", operation: "CatalogSync", correlationId,
          level: "ERROR", ok: false, message, durationMs: Date.now() - startedAt,
        },
      });
      throw e;
    }
  }

  history(restaurantId: string, take = 20) {
    return this.prisma.syncRun.findMany({
      where: { restaurantId },
      orderBy: { startedAt: "desc" },
      take,
    });
  }


    /** One TPAPI call with retries on network failures, timing and a log row. */
  private async tracedCall<T>(
    client: TpapiClient,
    restaurantId: string,
    correlationId: string,
    operation: string,
    args: Row,
  ): Promise<T & { ReturnCode: number; ReturnMessage: string }> {
    const attempts = 3;
    const startedAt = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await client.call<T & { ReturnCode: number; ReturnMessage: string }>(
          operation, args, { correlationId },
        );
        await this.logCall(restaurantId, correlationId, operation, true, Date.now() - startedAt, null);
        // Be polite to the POS: it is a live restaurant server, not a load-test target.
        await sleep(150);
        return res;
      } catch (e) {
        lastError = e;
        const retriable = e instanceof TpapiTransportError && attempt < attempts;
        const message = e instanceof Error ? e.message : String(e);
        if (!retriable) {
          await this.logCall(restaurantId, correlationId, operation, false, Date.now() - startedAt, message);
          throw e;
        }
        const delay = 500 * 2 ** (attempt - 1);
        this.logger.warn(`${operation} failed (${attempt}/${attempts}): ${message} — retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
    throw lastError;
  }

  private async logCall(
    restaurantId: string,
    correlationId: string,
    operation: string,
    ok: boolean,
    durationMs: number,
    message: string | null,
  ): Promise<void> {
    await this.prisma.integrationLog.create({
      data: {
        restaurantId, kind: "TPAPI", operation, correlationId,
        level: ok ? "INFO" : "ERROR", ok, durationMs, message,
      },
    }).catch(() => undefined);
  }}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}