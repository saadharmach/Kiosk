import { readConfigFile, withPrinter, writeConfigFile } from "./config.mjs";
import { canReach, pair, requestTest } from "./pairing.mjs";
import { installService } from "./service.mjs";

/**
 * `setup <api address> <code>`: everything that used to be done by hand. Returns the exit code.
 *
 *   1. trade the one-time code for the printer's secret
 *   2. write it into the settings file (a running helper notices by itself)
 *   3. check this computer can reach the printer
 *   4. start the helper at boot and now
 *   5. queue a test ticket
 *
 * A step after the pairing that fails is reported and does not undo the pairing.
 * options: { apiUrl, code, configPath, cli, dir, service?, test?, out?, deps? }
 */
export async function runSetup({ apiUrl, code, configPath, cli, dir, service = true, test = true, out = console.log, deps = {} }) {
  const { pairImpl = pair, requestTestImpl = requestTest, canReachImpl = canReach, installImpl = installService } = deps;
  if (!apiUrl || !code) {
    out("Usage: node src/cli.mjs setup <API address> <setup code>");
    out("Both are shown in the back office, under the printer's \"Set up the helper\".");
    return 2;
  }
  if (!/^https?:\/\//i.test(apiUrl)) {
    out(`The API address must start with http:// or https:// (got "${apiUrl}")`);
    return 2;
  }
  apiUrl = apiUrl.replace(/\/+$/, "");

  let existing;
  try {
    existing = readConfigFile(configPath).values;
  } catch (e) {
    out(`${e.message}`);
    out("Fix or delete that file, then run the setup again.");
    return 2;
  }

  out(`Pairing with ${apiUrl} ...`);
  let paired;
  try {
    paired = await pairImpl({ apiUrl, code });
  } catch (e) {
    out(`FAILED: ${e.message}`);
    return 1;
  }
  out(`OK  Paired with "${paired.label}".`);

  try {
    writeConfigFile(configPath, { ...withPrinter({ pollIntervalMs: 2000, ...existing, apiUrl }, { id: paired.printerId, label: paired.label, token: paired.token }) });
  } catch (e) {
    out(`FAILED: the secret could not be saved (${e.message}). The code is now used up: get a new one in the back office.`);
    return 1;
  }
  out(`OK  Saved to ${configPath}`);

  let problems = 0;
  if (paired.host && paired.port) {
    const r = await canReachImpl(paired.host, paired.port);
    if (r.ok) out(`OK  This computer can reach the printer at ${paired.host}:${paired.port}.`);
    else {
      problems++;
      out(`!!  This computer cannot reach the printer at ${paired.host}:${paired.port} (${r.reason}).`);
      out("    Check that the printer is on, that the address is right in the back office, and that this computer is on the same network.");
    }
  }

  let running = false;
  if (service) {
    const s = await installImpl({ cli, dir });
    out(`${s.ok ? "OK " : "!! "} ${s.message}`);
    running = s.ok;
    if (!s.ok) problems++;
  }
  if (!running) out(`To run the helper now: node ${cli}`);

  if (test) {
    try {
      await requestTestImpl({ apiUrl, token: paired.token });
      out(`OK  A test ticket is queued. It prints within a few seconds${running ? "" : " of the helper starting"}.`);
    } catch (e) {
      problems++;
      out(`!!  Could not queue the test ticket (${e.message}). Use "Print a test ticket" in the back office.`);
    }
  }

  out(problems === 0 ? "Done. The back office should show this printer's helper as Online." : "Paired, but see the lines marked !! above.");
  return 0;
}
