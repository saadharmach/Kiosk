import assert from "node:assert/strict";
import fs from "node:fs";
import { after, describe, it } from "node:test";
import { startHelper } from "../src/helper.mjs";
import { explainWindowsPrint, listWindowsPrinters, sendToWindowsPrinter } from "../src/windows-printer.mjs";

const running = [];
after(async () => { await Promise.all(running.map((h) => h.stop())); });
const until = async (check, ms = 2000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (check()) return; await new Promise((r) => setTimeout(r, 10)); } };

/** A stand-in for PowerShell: records what it was asked, and answers `stdout`. */
function fakePowershell(stdout, { fail = null } = {}) {
  const calls = [];
  const execImpl = (file, args, options, cb) => {
    const script = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
    const ticket = options.env.NEXBORN_TICKET_FILE;
    calls.push({ file, script, env: options.env, ticketBytes: ticket ? fs.readFileSync(ticket) : null });
    setImmediate(() => (fail ? cb(new Error(fail), "", fail) : cb(null, stdout, "")));
  };
  return { calls, execImpl };
}

describe("printing to a USB printer through Windows", () => {
  it("gives Windows the ticket's exact bytes and the printer's name, then removes the temporary file", async () => {
    const ps = fakePowershell("ok");
    const data = Buffer.from([0x1b, 0x40, ...Buffer.from("Bonjour\n"), 0x1d, 0x56, 0x42, 0]);
    await sendToWindowsPrinter({ printerName: "EPSON TM-T20III", data, execImpl: ps.execImpl });
    assert.equal(ps.calls[0].file, "powershell.exe");
    assert.match(ps.calls[0].script, /pDataType = "RAW"/, "RAW, so the printer gets the bytes as they are");
    assert.equal(ps.calls[0].env.NEXBORN_PRINTER_NAME, "EPSON TM-T20III");
    assert.deepEqual(ps.calls[0].ticketBytes, data);
    assert.equal(fs.existsSync(ps.calls[0].env.NEXBORN_TICKET_FILE), false);
  });

  it("a printer Windows does not have: says which, in plain words", async () => {
    const ps = fakePowershell("open:1801");
    await assert.rejects(sendToWindowsPrinter({ printerName: "Old printer", data: Buffer.from("x"), execImpl: ps.execImpl }),
      /Windows has no printer called "Old printer"/);
  });

  it("no printer chosen yet, or PowerShell failing: a clear error, never a silent success", async () => {
    await assert.rejects(sendToWindowsPrinter({ printerName: null, data: Buffer.from("x"), execImpl: fakePowershell("ok").execImpl }), /choose this printer's name/);
    await assert.rejects(sendToWindowsPrinter({ printerName: "P", data: Buffer.from("x"), execImpl: fakePowershell("", { fail: "boom" }).execImpl }), /boom/);
    assert.match(explainWindowsPrint("write:31", "P"), /could not print on "P" \(write, error 31\)/);
  });

  it("lists the computer's printers, once each", async () => {
    const ps = fakePowershell("EPSON TM-T20III\r\nMicrosoft Print to PDF\r\n\r\nEPSON TM-T20III\r\n");
    assert.deepEqual(await listWindowsPrinters({ execImpl: ps.execImpl }), ["EPSON TM-T20III", "Microsoft Print to PDF"]);
    assert.match(ps.calls[0].script, /Win32_Printer/);
  });
});

describe("the helper with a USB printer", () => {
  it("sends a USB ticket to Windows, a network ticket to the network, and reports the computer's printers", async () => {
    const usbJob = { id: "usb-1", attempt: 1, connection: "USB", host: null, port: null, printerName: "XP-80C", dataBase64: Buffer.from("A").toString("base64") };
    const netJob = { id: "net-1", attempt: 1, connection: "NETWORK", host: "10.0.0.5", port: 9100, printerName: null, dataBase64: Buffer.from("B").toString("base64") };
    const queue = [usbJob, netJob];
    const posted = [];
    const fetchImpl = async (url, init) => {
      if (/\/print\/next/.test(String(url))) return Response.json({ job: queue.shift() ?? null });
      posted.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      return Response.json({});
    };
    const usb = [], network = [];
    const helper = startHelper({
      apiUrl: "https://api.test", token: "t", intervalMs: 10, waitSec: 0, log: () => {}, fetchImpl,
      sendImpl: async (j) => { network.push(j); },
      sendUsbImpl: async (j) => { usb.push(j); },
      listPrintersImpl: async () => ["XP-80C", "Microsoft Print to PDF"],
    });
    running.push(helper);
    await until(() => posted.filter((p) => p.url.endsWith("/result")).length === 2);
    assert.deepEqual(usb.map((j) => [j.printerName, j.data.toString()]), [["XP-80C", "A"]]);
    assert.deepEqual(network.map((j) => [j.host, j.port, j.data.toString()]), [["10.0.0.5", 9100, "B"]]);
    const report = posted.find((p) => p.url.endsWith("/api/print/printers"));
    assert.deepEqual(report?.body, { names: ["XP-80C", "Microsoft Print to PDF"] });
  });
});
