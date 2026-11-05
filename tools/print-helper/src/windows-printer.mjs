import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * USB printers, through Windows. The printer is plugged into this computer and installed in Windows with its driver
 * (the maker's, or "Generic / Text Only"); the ticket's bytes go to it through the Windows print spooler as RAW data,
 * so they reach the printer exactly as over the network (cutting included). This is how point-of-sale software prints
 * to USB receipt printers on Windows. Windows' own PowerShell does it: nothing more to install.
 */

/** PowerShell, given its script as -EncodedCommand (UTF-16LE base64): no quoting can break it. */
function powershell(script, { env = {}, timeoutMs = 30_000, execImpl = execFile } = {}) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    execImpl(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { env: { ...process.env, ...env }, timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) return reject(Object.assign(new Error(String(stderr || error.message).trim().split("\n")[0] || "PowerShell failed"), { cause: error }));
        resolve(String(stdout));
      },
    );
  });
}

/** The printers installed in Windows on this computer, by name. */
export async function listWindowsPrinters({ execImpl } = {}) {
  const out = await powershell(
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-CimInstance Win32_Printer | ForEach-Object { $_.Name }",
    { execImpl, timeoutMs: 20_000 },
  );
  return [...new Set(out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
}

// Opens the printer, starts a RAW document, writes the bytes, and answers "ok" or "step:windowsErrorCode".
const RAW_PRINT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NexbornRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int written);
  public static string Send(string name, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(name, out h, IntPtr.Zero)) return "open:" + Marshal.GetLastWin32Error();
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "NEXBORN ticket"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return "start:" + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return "page:" + Marshal.GetLastWin32Error();
        int written;
        bool ok = WritePrinter(h, data, data.Length, out written);
        EndPagePrinter(h);
        if (!ok || written != data.Length) return "write:" + Marshal.GetLastWin32Error();
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return "ok";
  }
}
"@
$bytes = [IO.File]::ReadAllBytes($env:NEXBORN_TICKET_FILE)
[Console]::Out.Write([NexbornRaw]::Send($env:NEXBORN_PRINTER_NAME, $bytes))
`;

/** What Windows' answer means, in words the person at the restaurant can act on. */
export function explainWindowsPrint(answer, printerName) {
  const [step, code] = answer.trim().split(":");
  if (step === "open" && (code === "1801" || code === "2")) {
    return `Windows has no printer called "${printerName}": check it is plugged in and installed, and choose it again in the back office`;
  }
  if (step === "open" && code === "5") return `Windows refused access to the printer "${printerName}"`;
  return `Windows could not print on "${printerName}" (${step || "unknown step"}, error ${code ?? "?"})`;
}

/** Sends a ticket's bytes to a Windows printer. Resolves once Windows has taken them; rejects with a readable message. */
export async function sendToWindowsPrinter({ printerName, data, timeoutMs = 30_000, execImpl } = {}) {
  if (process.platform !== "win32" && !execImpl) throw new Error("USB printers work only when NEXBORN Helper runs on Windows");
  if (!printerName) throw new Error("No USB printer chosen: choose this printer's name in the back office (Bornes et imprimantes)");
  const file = path.join(os.tmpdir(), `nexborn-ticket-${randomBytes(6).toString("hex")}.bin`);
  fs.writeFileSync(file, data);
  try {
    const answer = await powershell(RAW_PRINT, {
      env: { NEXBORN_TICKET_FILE: file, NEXBORN_PRINTER_NAME: printerName },
      timeoutMs,
      execImpl,
    });
    if (answer.trim() !== "ok") throw new Error(explainWindowsPrint(answer, printerName));
  } finally {
    fs.rmSync(file, { force: true });
  }
}
