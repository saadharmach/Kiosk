# Kiosk print helper

A small program that runs at the restaurant. It fetches new customer tickets from the kiosk API and prints them on the
restaurant's network receipt printer (80 mm, ESC/POS, raw TCP port 9100).

It only makes **outbound** connections (HTTPS to the API, and TCP to the printer on the local network). No router or
firewall changes are needed.

```
kiosk ── order ──> API ──(ticket queued)──> print helper ──(TCP 9100)──> printer
```

## What you need

- A computer at the restaurant that is **always on** and on the **same network as the printer** (the kiosk PC is fine).
- **Node.js 20 or newer** on that computer (https://nodejs.org, the LTS version). Nothing else: the helper has no
  dependencies and needs no `npm install`.
- The printer's **IP address**. Give the printer a fixed address (a DHCP reservation in the router, or a static IP on
  the printer), otherwise tickets stop the day the router hands it a new one.
- A printer that speaks **ESC/POS** on port **9100** (most 80 mm receipt printers: Epson TM-series, Xprinter, Star in
  ESC/POS mode, and so on).

## 1. Check the printer first

Copy the `tools/print-helper` folder to the computer (for example to `C:\kiosk-print-helper`). In a terminal inside it:

```
node src/cli.mjs --printer 192.168.1.50
```

Use the printer's IP (add `:PORT` if it is not 9100). The printer should print "Kiosk print helper. The printer is
reachable." and cut. If it does not, fix that before going further (see Troubleshooting).

## 2. Set up the printer in the back office

1. Back office > **Printer**.
2. Enter the printer's **address** and **port**, leave *automatic printing* on, choose the *character set*, **Save**.
3. Click **Generate token** and **copy it now**. It is shown only once.
4. Click **Print a test ticket**. It waits in the queue until the helper is running.

## 3. Configure the helper

In the helper folder, copy `helper.config.example.json` to `helper.config.json` and fill it in:

```json
{
  "apiUrl": "https://api.your-domain.example",
  "token": "pht_the-token-from-the-back-office",
  "pollIntervalMs": 2000
}
```

`apiUrl` is the address of the kiosk **API** (ask whoever deployed it). The file holds a secret: do not share it or put
it in version control (it is already ignored by git).

You can use environment variables instead (`KIOSK_API_URL`, `PRINT_HELPER_TOKEN`, `POLL_INTERVAL_MS`). If both are set,
the environment variable wins.

## 4. Run it

```
node src/cli.mjs
```

You should see `Print helper started`, then the test ticket printing, and the back office should show the helper as
**Online**. Stop it with Ctrl+C.

## 5. Make it start by itself

The helper must survive reboots. Choose the one that matches the computer.

> These service recipes have **not been tested on real machines** yet. Try them once while you are on site, and reboot
> the computer to prove that tickets still print.

### Windows (Task Scheduler, no extra software)

Open PowerShell **as Administrator** and run (change the two paths if needed; find node with `where node`):

```powershell
$dir  = "C:\kiosk-print-helper"
$node = "C:\Program Files\nodejs\node.exe"

$action   = New-ScheduledTaskAction -Execute "cmd.exe" `
            -Argument "/c cd /d $dir && `"$node`" src\cli.mjs >> helper.log 2>&1"
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName "Kiosk Print Helper" -Action $action -Trigger $trigger `
            -Settings $settings -User "SYSTEM" -RunLevel Highest

Start-ScheduledTask -TaskName "Kiosk Print Helper"
```

It starts at boot without anyone logging in, restarts itself if it ever stops, and writes its log to
`C:\kiosk-print-helper\helper.log`. To remove it: `Unregister-ScheduledTask -TaskName "Kiosk Print Helper" -Confirm:$false`.

`helper.log` grows over time. It is small (a few lines per ticket), but delete or archive it once in a while.

### Linux (systemd)

Save as `/etc/systemd/system/kiosk-print-helper.service` (adjust the paths and the user):

```ini
[Unit]
Description=Kiosk print helper
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/kiosk-print-helper
ExecStart=/usr/bin/node src/cli.mjs
Restart=always
RestartSec=5
User=kiosk

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl daemon-reload
sudo systemctl enable --now kiosk-print-helper
journalctl -u kiosk-print-helper -f      # the log
```

## Day to day

- **Status:** Back office > Printer shows *Online* while the helper is running, the last contact, the last printing
  error, and the recent tickets. A ticket that keeps failing is retried 5 times (waiting a little longer each time) and
  then shows as **FAILED** with the reason. Open the order and use **Print ticket** to print it again.
- **Reprint** any time from an order's page.
- **New token:** *Generate a new token* in the back office, put it in `helper.config.json`, restart the helper. The old
  token stops working immediately. Do this if the config file might have leaked or the computer is replaced.
- **Update the helper:** replace the `src` folder with the new one and restart it. Tickets are built by the API, so
  layout changes do not need a helper update.

## Troubleshooting

| What you see | Likely cause |
|---|---|
| `Connection refused by 192.168.1.50:9100` | The printer is off, or the port is wrong (some models use a different one, see the printer's self-test sheet). |
| `Cannot reach 192.168.1.50:9100` or a timeout | Wrong IP, the printer is on another network, or a firewall blocks it. Ping it from the helper computer. |
| `The API rejected the helper token` | The token was regenerated or mistyped. Generate a new one and update the config. |
| `Cannot reach the API at ... (ENOTFOUND / ECONNREFUSED)` | Wrong `apiUrl`, or the computer has no internet. |
| Helper shows *Offline* in the back office | It is not running, or cannot reach the API. Check `helper.log`. |
| Accents print as strange symbols | Change the *Character set* in the back office and print another test ticket (try PC858, then PC437, then Windows-1252). |
| Text is cut off at the edge, or lines wrap oddly | The printer is set to 58 mm paper or another width. Tickets are laid out for 80 mm (48 characters). |
| The paper is not cut | Turn *Cut the paper after each ticket* on, or the printer has no cutter. |
| Two tickets per order | *Copies* is set to 2, or two helpers use the same printer. |

## Checklist for the first real printer

1. `node src/cli.mjs --printer <ip>` prints the test page and cuts.
2. Back office: address and port saved, token generated, helper started, status **Online**.
3. **Print a test ticket**: check the width (nothing cut off), the accents (é è à ç ô ù œ €), the large number, and the cut.
4. Place a real order on the kiosk and confirm the ticket prints **by itself**, within a few seconds.
5. Switch the printer off, place an order, switch it on: the ticket must print by itself once the printer is back, and the
   back office must show the error while it was off.
6. Reboot the helper computer and confirm the helper comes back and prints without anyone touching it.
7. Reprint an old order from the back office.
