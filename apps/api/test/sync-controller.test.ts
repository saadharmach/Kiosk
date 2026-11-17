import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadGatewayException, NotFoundException } from "@nestjs/common";
import { TpapiReturnCodeError, TpapiTransportError } from "@kiosk/tpapi";
import { SyncController, tillProblem } from "../src/sync/sync.controller.js";

const ID = "4a745b74-6dd1-43cf-bec7-c5a20c4e5293";
const controller = (fail: unknown) => new SyncController({ run: async () => { throw fail; } } as never, {} as never);

describe("Sync button: what the admin sees when the till refuses", () => {
  it("the till's own message, not an internal server error", async () => {
    await assert.rejects(controller(new TpapiReturnCodeError(2, "Incorrect username and/or password")).run(ID), (e: unknown) => {
      assert.ok(e instanceof BadGatewayException);
      assert.deepEqual(e.getResponse(), { code: "TILL_ERROR", message: "The till refused the sync: Incorrect username and/or password" });
      return true;
    });
  });
  it("a till that does not answer says why", () => {
    const e = tillProblem(new TpapiTransportError("fetch failed (ETIMEDOUT)")) as BadGatewayException;
    assert.equal((e.getResponse() as { message: string }).message, "The till did not answer: fetch failed (ETIMEDOUT)");
  });
  it("other errors are left alone", () => {
    const nf = new NotFoundException("No TPAPI configuration for this restaurant");
    assert.equal(tillProblem(nf), nf);
  });
});
