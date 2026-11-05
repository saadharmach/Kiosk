import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readTicket } from "./escpos-read.mjs";

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

// Draws the ticket's lines with the printer's Windows driver, as Notepad prints: Windows draws the letters (so every
// accent prints), in Consolas sized so 48 characters fill the paper's width. The big number (a line printed 4 times
// or more) is drawn across about 84% of the width, up to 13 times the normal size. One page per copy.
const DRIVER_PRINT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$job = Get-Content -Raw -Encoding UTF8 $env:NEXBORN_TICKET_FILE | ConvertFrom-Json
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $env:NEXBORN_PRINTER_NAME
if (-not $doc.PrinterSettings.IsValid) { [Console]::Out.Write('open:1801'); exit }
$doc.DocumentName = 'NEXBORN ticket'
# No "Printing..." window: the helper runs in the background.
$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$doc.OriginAtMargins = $false
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$script:page = 0
$script:line = 0
$doc.add_PrintPage({
  param($s, $e)
  $g = $e.Graphics
  $area = $g.VisibleClipBounds
  $left = $area.Left + 2
  $width = $area.Width - 4
  $fmt = [System.Drawing.StringFormat]::GenericTypographic
  $probe = New-Object System.Drawing.Font('Consolas', 10)
  $base = 10 * $width / $g.MeasureString(('M' * [int]$job.columns), $probe, 100000, $fmt).Width
  $probe.Dispose()
  $lines = @($job.pages[$script:page])
  $y = $area.Top + 2
  while ($script:line -lt $lines.Count) {
    $l = $lines[$script:line]
    $text = [string]$l.text
    if ($text -eq '') { $text = ' ' }
    $style = if ($l.bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $big = [int]$l.height -ge 4
    if ($big) {
      $probe = New-Object System.Drawing.Font('Consolas', 10, $style)
      $fit = 10 * 0.84 * $width / $g.MeasureString($text, $probe, 100000, $fmt).Width
      $probe.Dispose()
      $size = [Math]::Min($fit, $base * 13)
      $sx = 1.0
    } else {
      $size = $base * [int]$l.height
      $sx = [double]$l.width / [double]$l.height
    }
    $font = New-Object System.Drawing.Font('Consolas', [single]$size, $style)
    $lineHeight = $font.GetHeight($g)
    if (($y + $lineHeight) -gt $area.Bottom -and $script:line -gt 0 -and $y -gt ($area.Top + 10)) { $font.Dispose(); $e.HasMorePages = $true; return }
    $drawn = $g.MeasureString($text, $font, 100000, $fmt).Width * $sx
    $x = $left
    if ($l.align -eq 'center') { $x = $left + ($width - $drawn) / 2 }
    elseif ($l.align -eq 'right') { $x = $left + $width - $drawn }
    $state = $g.Save()
    $g.TranslateTransform([single]$x, [single]$y)
    $g.ScaleTransform([single]$sx, 1)
    $g.DrawString($text, $font, [System.Drawing.Brushes]::Black, 0, 0, $fmt)
    $g.Restore($state)
    $y += $lineHeight
    $font.Dispose()
    $script:line++
  }
  $script:page++
  $script:line = 0
  $e.HasMorePages = $script:page -lt @($job.pages).Count
})
$doc.Print()
[Console]::Out.Write('ok')
`;

/**
 * Prints a ticket through the printer's Windows driver, like Notepad: the server's ticket is read back into lines and
 * Windows draws them. Accents print whatever the printer's character tables; the paper is cut as the driver is set to.
 */
export async function printWithWindowsDriver({ printerName, data, columns = 48, timeoutMs = 45_000, execImpl } = {}) {
  if (process.platform !== "win32" && !execImpl) throw new Error("USB printers work only when NEXBORN Helper runs on Windows");
  if (!printerName) throw new Error("No USB printer chosen: choose this printer's name in the back office (Bornes et imprimantes)");
  const pages = readTicket(data);
  if (pages.length === 0) throw new Error("The ticket was empty");
  const file = path.join(os.tmpdir(), `nexborn-ticket-${randomBytes(6).toString("hex")}.json`);
  fs.writeFileSync(file, JSON.stringify({ columns, pages }), "utf8");
  try {
    const answer = await powershell(DRIVER_PRINT, {
      env: { NEXBORN_TICKET_FILE: file, NEXBORN_PRINTER_NAME: printerName },
      timeoutMs,
      execImpl,
    });
    if (answer.trim() !== "ok") throw new Error(explainWindowsPrint(answer, printerName));
  } finally {
    fs.rmSync(file, { force: true });
  }
}
