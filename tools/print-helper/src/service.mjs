import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Makes the helper start by itself when the computer starts. Windows: a scheduled task that runs as SYSTEM at boot.
 * Linux: a systemd user service (no root needed) that keeps running after logout.
 *
 * The text of the task and of the unit are plain functions so they can be checked without touching a computer.
 * NOT yet tried on real machines: reboot the printer PC once and confirm tickets still print.
 */

export const SERVICE_NAME = "kiosk-print-helper";
export const TASK_NAME = "Kiosk Print Helper";

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** The PowerShell that (re)creates the scheduled task and starts it. */
export function windowsTaskScript({ node, cli, dir }) {
  const cmd = `/c cd /d "${dir}" && "${node}" "${cli}" >> helper.log 2>&1`;
  return [
    "$ErrorActionPreference = 'Stop'",
    `Stop-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -ErrorAction SilentlyContinue`,
    `Unregister-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Confirm:$false -ErrorAction SilentlyContinue`,
    `$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ${psQuote(cmd)}`,
    "$trigger = New-ScheduledTaskTrigger -AtStartup",
    "$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable",
    `Register-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest | Out-Null`,
    `Start-ScheduledTask -TaskName ${psQuote(TASK_NAME)}`,
  ].join("\n");
}

export const windowsRemoveScript = () => [
  `Stop-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -ErrorAction SilentlyContinue`,
  `Unregister-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Confirm:$false`,
].join("\n");

/** systemd refuses a path with a space or a quote unless it is quoted. */
const unitQuote = (s) => (/[\s"\\]/.test(s) ? `"${String(s).replace(/(["\\])/g, "\\$1")}"` : s);

export function systemdUnit({ node, cli, dir }) {
  return `[Unit]
Description=Kiosk print helper
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=${unitQuote(dir)}
ExecStart=${unitQuote(node)} ${unitQuote(cli)}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`;
}

const manual = (cli) => `Start it by hand with: node ${cli}  (it must be started again after every restart of the computer)`;

/**
 * Registers the auto-start. Resolves to { ok, message }; it never throws, because a service that could not be
 * installed must not undo the pairing that has already worked.
 * options: { platform?, node?, cli, dir, run?, home?, user?, fsImpl? }
 */
export function installService({
  platform = process.platform, node = process.execPath, cli, dir,
  run = (file, args) => execFileSync(file, args, { stdio: "pipe", encoding: "utf8", timeout: 60000 }),
  home = os.homedir(), fsImpl = fs, user = os.userInfo().username,
}) {
  try {
    if (platform === "win32") {
      try {
        run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", windowsTaskScript({ node, cli, dir })]);
      } catch (e) {
        const text = `${e.stderr ?? ""}${e.message ?? ""}`;
        if (/denied|administrator|0x80070005/i.test(text)) {
          return { ok: false, message: "Windows needs administrator rights to start the helper at boot. Close this window, open PowerShell with \"Run as administrator\" and run the same command again." };
        }
        throw e;
      }
      return { ok: true, message: `Registered the "${TASK_NAME}" task: it starts at boot and restarts itself. Its log is ${path.join(dir, "helper.log")}` };
    }
    if (platform === "linux") {
      const unitDir = path.join(home, ".config", "systemd", "user");
      fsImpl.mkdirSync(unitDir, { recursive: true });
      fsImpl.writeFileSync(path.join(unitDir, `${SERVICE_NAME}.service`), systemdUnit({ node, cli, dir }));
      run("systemctl", ["--user", "daemon-reload"]);
      run("systemctl", ["--user", "enable", "--now", `${SERVICE_NAME}.service`]);
      let linger = "";
      try {
        run("loginctl", ["enable-linger", user]);
      } catch {
        linger = ` One more thing: run "sudo loginctl enable-linger ${user}" so that it also starts when nobody is logged in.`;
      }
      return { ok: true, message: `Installed the ${SERVICE_NAME} service: it starts at boot and restarts itself. Log: journalctl --user -u ${SERVICE_NAME} -f.${linger}` };
    }
    return { ok: false, message: `Starting at boot is not set up for ${platform} yet. ${manual(cli)}` };
  } catch (e) {
    const detail = String(e.stderr || e.message || e).trim().split("\n").slice(-2).join(" ");
    return { ok: false, message: `Could not set up the start at boot (${detail}). ${manual(cli)}` };
  }
}

export function uninstallService({
  platform = process.platform, home = os.homedir(), fsImpl = fs,
  run = (file, args) => execFileSync(file, args, { stdio: "pipe", encoding: "utf8", timeout: 60000 }),
}) {
  try {
    if (platform === "win32") {
      run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", windowsRemoveScript()]);
      return { ok: true, message: `Removed the "${TASK_NAME}" task.` };
    }
    if (platform === "linux") {
      try { run("systemctl", ["--user", "disable", "--now", `${SERVICE_NAME}.service`]); } catch { /* maybe never installed */ }
      fsImpl.rmSync(path.join(home, ".config", "systemd", "user", `${SERVICE_NAME}.service`), { force: true });
      try { run("systemctl", ["--user", "daemon-reload"]); } catch { /* nothing to reload */ }
      return { ok: true, message: `Removed the ${SERVICE_NAME} service.` };
    }
    return { ok: false, message: `Nothing was set up for ${platform}.` };
  } catch (e) {
    return { ok: false, message: `Could not remove it: ${String(e.stderr || e.message || e).trim().split("\n").slice(-2).join(" ")}` };
  }
}
