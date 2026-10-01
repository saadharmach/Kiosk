import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SuggestionsService } from "../src/restaurant/suggestions.service.js";
import { model, type Call } from "./helpers/fake-prisma.js";

const art = (id: bigint, name: string, over: Record<string, unknown> = {}) =>
  ({ untillId: id, name, departmentId: 1n, isActive: true, isPresent: true, isMenu: false, ...over });

function setup(links: Record<string, unknown>[] = []) {
  const calls: Call[] = [];
  const writes: { op: string; args: unknown }[] = [];
  const prisma = {
    tpapiDepartment: model([{ untillId: 1n, name: "Mains", number: 1 }, { untillId: 2n, name: "Drinks", number: 2 }], calls, "tpapiDepartment"),
    categoryPresentation: model([{ scope: "DEPARTMENT", untillId: 2n, displayName: { fr: "Boissons" } }], calls, "categoryPresentation"),
    productPresentation: model([{ articleId: 11n, displayName: { fr: "Coca (FR)" }, imagePath: "restaurants/r1/products/11/a.png" }], calls, "productPresentation"),
    tpapiArticle: model([
      art(10n, "Burger"), art(11n, "Cola", { departmentId: 2n }), art(12n, "Menu of the day", { isMenu: true }),
      art(13n, "Retired", { isActive: false }), art(14n, "Not in unTill", { isPresent: false }),
    ], calls, "tpapiArticle"),
    departmentSuggestion: {
      ...model(links, calls, "departmentSuggestion"),
      deleteMany: (args: unknown) => ({ op: "deleteMany", args }),
      createMany: (args: unknown) => ({ op: "createMany", args }),
    },
    $transaction: async (ops: { op: string; args: unknown }[]) => { writes.push(...ops); return []; },
  };
  return { svc: new SuggestionsService(prisma as never, { publicUrl: (p: string | null) => (p ? `https://cdn.test/${p}` : null) } as never), calls, writes };
}

describe("setting a department's suggestions", () => {
  it("replaces the whole list in the order given, scoped to this restaurant and department", async () => {
    const { svc, writes } = setup();
    await svc.replace("r1", "1", ["11", "10"]);
    assert.deepEqual(writes[0], { op: "deleteMany", args: { where: { restaurantId: "r1", departmentId: 1n } } });
    assert.deepEqual(writes[1], {
      op: "createMany",
      args: { data: [
        { restaurantId: "r1", departmentId: 1n, articleId: 11n, sortOrder: 0 },
        { restaurantId: "r1", departmentId: 1n, articleId: 10n, sortOrder: 1 },
      ] },
    });
  });

  it("an empty list clears the department", async () => {
    const { svc, writes } = setup();
    await svc.replace("r1", "1", []);
    assert.deepEqual(writes.map((w) => w.op), ["deleteMany"]);
  });

  it("ignores a repeated product", async () => {
    const { svc, writes } = setup();
    await svc.replace("r1", "1", ["10", "10"]);
    assert.equal((writes[1]!.args as { data: unknown[] }).data.length, 1);
  });

  it("refuses an unknown department, with nothing written", async () => {
    const { svc, writes } = setup();
    await assert.rejects(svc.replace("r1", "99", ["10"]), NotFoundException);
    assert.equal(writes.length, 0);
  });

  it("refuses unknown, retired and removed products, and menus, with nothing written", async () => {
    const { svc, writes } = setup();
    for (const bad of ["999", "13", "14", "12"]) {
      await assert.rejects(svc.replace("r1", "1", ["10", bad]), BadRequestException, bad);
    }
    assert.equal(writes.length, 0);
  });

  it("refuses more than 12", async () => {
    const { svc } = setup();
    await assert.rejects(svc.replace("r1", "1", Array.from({ length: 13 }, (_, i) => String(100 + i))), BadRequestException);
  });

  it("looks everything up inside the restaurant", async () => {
    const { svc, calls } = setup();
    await svc.replace("r1", "1", ["10"]);
    for (const c of calls) assert.equal((c.args as { where: { restaurantId: string } }).where.restaurantId, "r1", `${c.model}.${c.op}`);
  });
});

describe("listing suggestions for the back office", () => {
  it("returns every department, each with its own list in order, and names from the presentation layer", async () => {
    const { svc } = setup([
      { restaurantId: "r1", departmentId: 1n, articleId: 11n, sortOrder: 1 },
      { restaurantId: "r1", departmentId: 1n, articleId: 10n, sortOrder: 0 },
      { restaurantId: "r1", departmentId: 2n, articleId: 10n, sortOrder: 0 },
    ]);
    const { departments } = await svc.list("r1");
    assert.deepEqual(departments.map((d) => [d.departmentId, d.name]), [["1", "Mains"], ["2", "Boissons"]]);
    assert.deepEqual(departments[0]!.suggestions.map((s) => s.articleId), ["10", "11"]);
    assert.deepEqual(departments[1]!.suggestions.map((s) => s.articleId), ["10"]);
  });

  it("a department with nothing set has an empty list", async () => {
    const { svc } = setup();
    const { departments } = await svc.list("r1");
    assert.deepEqual(departments.map((d) => d.suggestions), [[], []]);
  });

  it("carries each product's name and photo as the kiosk will show them", async () => {
    const { svc } = setup([
      { restaurantId: "r1", departmentId: 1n, articleId: 11n, sortOrder: 0 },
      { restaurantId: "r1", departmentId: 1n, articleId: 10n, sortOrder: 1 },
    ]);
    const [mains] = (await svc.list("r1")).departments;
    assert.deepEqual(mains!.suggestions.map((s) => [s.name, s.imageUrl]), [
      ["Coca (FR)", "https://cdn.test/restaurants/r1/products/11/a.png"],
      ["Burger", null],
    ]);
  });
});
