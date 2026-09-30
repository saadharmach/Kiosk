/** A tiny in-memory stand-in for the Prisma client, for running real services without a database. */

type Row = Record<string, unknown>;

/** Decimal stand-in: the services only ever call toNumber(). */
export const D = (n: number) => ({ toNumber: () => n });

/**
 * Does a row satisfy a where clause? Supports equality and { in: [...] } on the fields a row
 * actually has. Keys the row does not have (restaurantId on a fixture, say) are skipped, and
 * nested filters like { has } are left to the code under test.
 */
export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (!(key in row)) continue;
    const value = row[key];
    if (cond && typeof cond === "object" && "in" in (cond as Row)) {
      if (!((cond as { in: unknown[] }).in).includes(value)) return false;
    } else if (cond !== undefined && typeof cond !== "object") {
      if (value !== cond) return false;
    } else if (typeof cond === "bigint" && value !== cond) return false;
  }
  return true;
}

export interface Call {
  model: string;
  op: string;
  args: unknown;
}

/** A model with the read methods the services use, answering from `rows`. */
export function model(rows: Row[], calls?: Call[], name = "model") {
  const log = (op: string, args: unknown) => calls?.push({ model: name, op, args });
  return {
    findMany: async (args?: { where?: Row; take?: number }) => {
      log("findMany", args);
      const found = rows.filter((r) => matches(r, args?.where));
      return args?.take ? found.slice(0, args.take) : found;
    },
    findFirst: async (args?: { where?: Row }) => {
      log("findFirst", args);
      return rows.find((r) => matches(r, args?.where)) ?? null;
    },
    findUnique: async (args?: { where?: Row }) => {
      log("findUnique", args);
      return rows.find((r) => matches(r, args?.where)) ?? null;
    },
    findUniqueOrThrow: async (args?: { where?: Row }) => {
      log("findUniqueOrThrow", args);
      const r = rows.find((x) => matches(x, args?.where));
      if (!r) throw new Error("Record not found");
      return r;
    },
  };
}
