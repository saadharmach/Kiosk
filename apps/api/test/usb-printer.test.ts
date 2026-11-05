import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PrintingService, summarizePrinter } from "../src/printing/printing.service.js";

function setup(existing: any = null) {
  const writes: { op: string; args: any }[] = [];
  const prisma: any = {
    printer: {
      findFirst: async () => existing,
      create: async (a: any) => { writes.push({ op: "create", args: a }); existing = { id: "p1", ...a.data }; return existing; },
      updateMany: async (a: any) => { writes.push({ op: "updateMany", args: a }); if (existing) Object.assign(existing, a.data); return { count: 1 }; },
    },
  };
  return { svc: new PrintingService(prisma), writes };
}
const base = { name: "Tickets", isEnabled: true };

describe("a USB printer", () => {
  it("is saved with the Windows printer's name and no port; the name may come later", async () => {
    const { svc, writes } = setup();
    await svc.save("r1", { ...base, connection: "USB", address: "" } as never, "k1");
    assert.equal(writes[0]!.args.data.connection, "USB");
    assert.equal(writes[0]!.args.data.address, null);
    assert.equal(writes[0]!.args.data.port, null);
    assert.equal(writes[0]!.args.data.restaurantId, "r1");
  });

  it("a network printer still needs a real address; a USB one takes any Windows name", async () => {
    const { svc } = setup();
    await assert.rejects(svc.save("r1", { ...base, address: "http://10.0.0.5", port: 9100 } as never), BadRequestException);
    await svc.save("r1", { ...base, connection: "USB", address: "EPSON TM-T20III (Copie 1)" } as never);
  });

  it("the back office sees how it is connected and the printers the helper reported (only once it has reported)", () => {
    const p: any = { id: "p1", connection: "USB", address: "XP-80C", port: null, isEnabled: true, config: {}, helperPrinters: [], helperPrintersAt: null };
    const before = summarizePrinter(p) as any;
    assert.equal(before.connection, "USB");
    assert.equal(before.helperPrinters, null, "not reported yet: no empty list pretending to be the answer");
    const after = summarizePrinter({ ...p, helperPrinters: ["XP-80C"], helperPrintersAt: new Date() }) as any;
    assert.deepEqual(after.helperPrinters, ["XP-80C"]);
  });

  it("the helper's list is kept clean (no blanks, no repeats, sorted) and only on its own printer", async () => {
    const { svc, writes } = setup({ id: "p1", restaurantId: "r1" });
    const r = await svc.setHelperPrinters({ id: "p1", restaurantId: "r1" } as never, ["XP-80C", " ", "Microsoft Print to PDF", "XP-80C"]);
    assert.deepEqual(r.names, ["Microsoft Print to PDF", "XP-80C"]);
    assert.deepEqual(writes[0]!.args.where, { id: "p1", restaurantId: "r1" });
  });
});
