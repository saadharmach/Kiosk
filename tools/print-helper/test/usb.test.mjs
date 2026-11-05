import assert from "node:assert/strict";
import fs from "node:fs";
import { after, describe, it } from "node:test";
import { startHelper } from "../src/helper.mjs";
import { readTicket } from "../src/escpos-read.mjs";
import { explainWindowsPrint, listWindowsPrinters, printWithWindowsDriver, sendToWindowsPrinter } from "../src/windows-printer.mjs";

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
    const usbJob = { id: "usb-1", attempt: 1, connection: "USB", usbMode: "RAW", host: null, port: null, printerName: "XP-80C", dataBase64: Buffer.from("A").toString("base64") };
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
      printUsbImpl: async () => { throw new Error("this USB printer is set to raw commands"); },
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

describe("printing through the Windows driver, like Notepad", () => {
  // What the server sends: reset, leave Chinese mode, PC858, a centred bold heading, the number at 8 times, accents, a cut.
  const ticket = (copies = 1) => Buffer.concat(Array.from({ length: copies }, () => Buffer.from([
    0x1b, 0x40, 0x1c, 0x2e, 0x1b, 0x74, 19,
    0x1b, 0x61, 1, 0x1b, 0x45, 1, ...Buffer.from("CHEVALET N"), 0xf8, 0x0a,
    0x1d, 0x21, 0x77, ...Buffer.from("12"), 0x0a, 0x1d, 0x21, 0x00, 0x1b, 0x45, 0,
    0x1b, 0x61, 0, ...Buffer.from("1 x Cr"), 0x8a, ...Buffer.from("me br"), 0x96, ...Buffer.from("l"), 0x82, ...Buffer.from("e 3,50 "), 0xd5, 0x0a,
    ...Buffer.from("Merci et "), 0x85, ...Buffer.from(" bient"), 0x93, ...Buffer.from("t !"), 0x0a,
    0x1b, 0x64, 3, 0x1d, 0x56, 0x42, 0x00,
  ])));

  it("reads the ticket back as lines, with every accent and the big number's size", () => {
    const [page, ...more] = readTicket(ticket());
    assert.equal(more.length, 0);
    assert.deepEqual(page.map((l) => l.text).filter(Boolean), ["CHEVALET N°", "12", "1 x Crème brûlée 3,50 €", "Merci et à bientôt !"]);
    const big = page.find((l) => l.text === "12");
    assert.deepEqual([big.width, big.height, big.align, big.bold], [8, 8, "center", true]);
    assert.ok(page.length <= 6, "the blank lines fed before the cutter are not kept");
  });

  it("each copy is a page of its own", () => {
    assert.equal(readTicket(ticket(2)).length, 2);
  });

  it("hands the lines to Windows, which draws them; a missing printer is said plainly", async () => {
    let sent = null;
    const ok = fakePowershell("ok");
    const execImpl = (file, args, options, cb) => { sent = JSON.parse(fs.readFileSync(options.env.NEXBORN_TICKET_FILE, "utf8")); ok.execImpl(file, args, options, cb); };
    await printWithWindowsDriver({ printerName: "POS-80", data: ticket(), execImpl });
    assert.equal(sent.columns, 48);
    assert.ok(sent.pages[0].some((l) => l.text === "1 x Crème brûlée 3,50 €"));
    assert.match(ok.calls[0].script, /System\.Drawing\.Printing\.PrintDocument/);
    assert.equal(ok.calls[0].env.NEXBORN_PRINTER_NAME, "POS-80");
    await assert.rejects(printWithWindowsDriver({ printerName: "Gone", data: ticket(), execImpl: fakePowershell("open:1801").execImpl }), /Windows has no printer called "Gone"/);
  });

  it("a USB printer prints through the driver unless it is set to raw commands", async () => {
    const queue = [
      { id: "d-1", attempt: 1, connection: "USB", usbMode: "DRIVER", printerName: "POS-80", dataBase64: ticket().toString("base64") },
      { id: "d-2", attempt: 1, connection: "USB", printerName: "POS-80", dataBase64: ticket().toString("base64") },
    ];
    const posted = [];
    const fetchImpl = async (url, init) => {
      if (/\/print\/next/.test(String(url))) return Response.json({ job: queue.shift() ?? null });
      posted.push(String(url));
      return Response.json({});
    };
    const driver = [];
    const helper = startHelper({
      apiUrl: "https://api.test", token: "t", intervalMs: 10, waitSec: 0, log: () => {}, fetchImpl, listPrintersImpl: null,
      sendUsbImpl: async () => { throw new Error("raw was not asked for"); },
      printUsbImpl: async (j) => { driver.push(j.printerName); },
    });
    running.push(helper);
    await until(() => posted.filter((u) => u.endsWith("/result")).length === 2);
    assert.deepEqual(driver, ["POS-80", "POS-80"], "the driver is the default, also for a server that does not say");
  });
});
