# Makes the kiosk dev sites running in WSL reachable from other devices on the same network (tablets, phones, the printer PC).
#
# Run in PowerShell AS ADMINISTRATOR, on the Windows PC that hosts WSL:
#     powershell -ExecutionPolicy Bypass -File <path to this file>
#     powershell -ExecutionPolicy Bypass -File <path to this file> -Remove     (undo)
#
# WSL's own address changes every time WSL restarts, so run it again after a restart of WSL or of the PC.
# The firewall rule only lets the local network in (RemoteAddress LocalSubnet), not the internet.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$ports = 3002, 3003, 3004, 3005   # kiosk, back office, platform admin, API
$rule  = 'Kiosk dev sites (WSL)'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Please run this in PowerShell opened with "Run as administrator".' -ForegroundColor Red
  exit 1
}

foreach ($p in $ports) { netsh interface portproxy delete v4tov4 listenport=$p listenaddress=0.0.0.0 2>$null | Out-Null }
Remove-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue
if ($Remove) { Write-Host 'Removed the port forwarding and the firewall rule.'; exit 0 }

$wsl = ((wsl.exe hostname -I) -split '\s+' | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1)
if (-not $wsl) { Write-Host 'Could not find WSL''s address. Is WSL running?' -ForegroundColor Red; exit 1 }

foreach ($p in $ports) { netsh interface portproxy add v4tov4 listenport=$p listenaddress=0.0.0.0 connectport=$p connectaddress=$wsl | Out-Null }
New-NetFirewallRule -DisplayName $rule -Direction Inbound -Action Allow -Protocol TCP -LocalPort $ports -RemoteAddress LocalSubnet -Profile Any | Out-Null

$lan = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1
Write-Host "Forwarding ports $($ports -join ', ') to WSL at $wsl."
Write-Host "From another device on this network open:"
Write-Host "  Kiosk           http://${lan}:3002/r/resto-a"
Write-Host "  Back office     http://${lan}:3003"
Write-Host "  Platform admin  http://${lan}:3004"
Write-Host 'Tip: give this PC a fixed address in the router (DHCP reservation), so these addresses do not change.'
