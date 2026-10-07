#!/usr/bin/env bash
# One-time setup of the kiosk server. Run as root on the server (install-server.sh does that for you).
# Safe to run again: every step checks first and only adds what is missing.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../config.sh
. "$HERE/config.sh"

say() { printf '\n== %s\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

say "Packages"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg nginx certbot python3-certbot-nginx rsync xz-utils \
  unattended-upgrades fail2ban
# PostgreSQL from its own repository, so the version matches Supabase (see config.sh).
if ! command -v "/usr/lib/postgresql/$PG_VERSION/bin/postgres" >/dev/null 2>&1; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  . /etc/os-release
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -q
  apt-get install -y -q "postgresql-$PG_VERSION" "postgresql-client-$PG_VERSION"
fi
systemctl enable --now unattended-upgrades fail2ban >/dev/null

say "Node.js 24"
if ! /usr/local/bin/node -v 2>/dev/null | grep -q '^v24\.'; then
  base=https://nodejs.org/dist/latest-v24.x
  file=$(curl -fsSL "$base/SHASUMS256.txt" | awk '/linux-x64\.tar\.xz$/ {print $2}')
  sum=$(curl -fsSL "$base/SHASUMS256.txt" | awk '/linux-x64\.tar\.xz$/ {print $1}')
  curl -fsSL "$base/$file" -o "/tmp/$file"
  echo "$sum  /tmp/$file" | sha256sum -c - >/dev/null || { echo "Node download did not match its checksum"; exit 1; }
  rm -rf /usr/local/lib/nodejs && mkdir -p /usr/local/lib/nodejs
  tar -xJf "/tmp/$file" -C /usr/local/lib/nodejs --strip-components=1 && rm -f "/tmp/$file"
  ln -sf /usr/local/lib/nodejs/bin/node /usr/local/bin/node
fi
echo "node $(/usr/local/bin/node -v)"

say "Swap (a safety margin if memory ever spikes)"
if [ -z "$(swapon --show)" ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-kiosk-swap.conf && sysctl -q -p /etc/sysctl.d/90-kiosk-swap.conf
fi
swapon --show

say "User and folders"
id kiosk >/dev/null 2>&1 || useradd --system --home-dir "$APP_ROOT" --shell /usr/sbin/nologin kiosk
install -d -o root -g root -m 755 "$APP_ROOT" "$APP_ROOT/releases"
install -d -o kiosk -g kiosk -m 755 "$MEDIA_DIR"
install -d -o postgres -g postgres -m 750 "$BACKUP_DIR"
install -d -o root -g kiosk -m 750 "$(dirname "$ENV_FILE")"

say "Database"
systemctl enable --now postgresql >/dev/null
if ! grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
  pw=$(openssl rand -hex 24)
  if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='kiosk'" | grep -q 1; then
    sudo -u postgres psql -q -c "alter role kiosk with login password '$pw'"
  else
    sudo -u postgres psql -q -c "create role kiosk with login password '$pw'"
  fi
  sudo -u postgres psql -tAc "select 1 from pg_database where datname='kiosk'" | grep -q 1 \
    || sudo -u postgres createdb -O kiosk kiosk
  url="postgresql://kiosk:${pw}@127.0.0.1:5432/kiosk"
  touch "$ENV_FILE" && chown root:kiosk "$ENV_FILE" && chmod 640 "$ENV_FILE"
  printf 'DATABASE_URL=%s\nDIRECT_URL=%s\n' "$url" "$url" >> "$ENV_FILE"
  echo "Database kiosk created (its password is only in $ENV_FILE)."
else
  echo "Database already set up."
fi

say "Settings ($ENV_FILE)"
set_default() { grep -q "^$1=" "$ENV_FILE" || printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; }
set_default NODE_ENV production
set_default PORT "$API_PORT"
set_default MEDIA_DIR "$MEDIA_DIR"
set_default KIOSK_APP_URL "https://$KIOSK_DOMAIN"
set_default BACKOFFICE_APP_URL "https://$BACKOFFICE_DOMAIN"
set_default ADMIN_APP_URL "https://$ADMIN_DOMAIN"
set_default CORS_ORIGINS "https://$KIOSK_DOMAIN,https://$BACKOFFICE_DOMAIN,https://$ADMIN_DOMAIN"
# A fresh signing key for this server: everyone signs in once more after the move, nothing else changes.
set_default JWT_SECRET "$(openssl rand -hex 48)"
[ -n "${ALERT_EMAIL:-}" ] && set_default ALERT_EMAIL "$ALERT_EMAIL"
printf 'PORT=%s\n' "$KIOSK_PORT" > /etc/kiosk/kiosk-web.env && chmod 644 /etc/kiosk/kiosk-web.env
echo "Still to come from your PC (push-secrets.sh): $(for k in ENCRYPTION_KEY SMTP_HOST SMTP_PASS MAIL_FROM; do grep -q "^$k=" "$ENV_FILE" || printf '%s ' "$k"; done)"

say "Services"
install -m 644 "$HERE"/systemd/kiosk-*.service "$HERE"/systemd/kiosk-*.timer /etc/systemd/system/
install -m 755 "$HERE/remote/kiosk-backup" "$HERE/remote/kiosk-alert" "$HERE/remote/kiosk-watch" /usr/local/bin/
install -d -m 700 /var/lib/kiosk/watch
systemctl daemon-reload
systemctl enable kiosk-api kiosk-web >/dev/null
systemctl enable --now kiosk-backup.timer kiosk-watch.timer >/dev/null
grep -q '^ALERT_EMAIL=.' "$ENV_FILE" && echo "Alerts go to $(sed -n 's/^ALERT_EMAIL=//p' "$ENV_FILE")." \
  || echo "No ALERT_EMAIL yet: alerts are only logged (set ALERT_EMAIL or CERT_EMAIL in deploy/config.sh and run this again)."
echo "kiosk-api and kiosk-web start after the first deploy."

say "nginx"
render() { sed -e "s|__KIOSK_DOMAIN__|$KIOSK_DOMAIN|g" -e "s|__BACKOFFICE_DOMAIN__|$BACKOFFICE_DOMAIN|g" \
  -e "s|__ADMIN_DOMAIN__|$ADMIN_DOMAIN|g" -e "s|__API_PORT__|$API_PORT|g" -e "s|__KIOSK_PORT__|$KIOSK_PORT|g" \
  -e "s|__APP_ROOT__|$APP_ROOT|g" -e "s|__MEDIA_DIR__|$MEDIA_DIR|g" "$1"; }
render "$HERE/nginx/kiosk-common.conf" > /etc/nginx/snippets/kiosk-common.conf
render "$HERE/nginx/kiosk-proxy.conf" > /etc/nginx/snippets/kiosk-proxy.conf
render "$HERE/nginx/kiosk-headers.conf" > /etc/nginx/snippets/kiosk-headers.conf
render "$HERE/nginx/default.conf" > /etc/nginx/sites-available/kiosk-default.conf
ln -sf /etc/nginx/sites-available/kiosk-default.conf /etc/nginx/sites-enabled/kiosk-default.conf
for site in kiosk backoffice admin; do
  # certbot adds https to these files once; running setup again must not undo that.
  if [ ! -f "/etc/nginx/sites-available/kiosk-$site.conf" ]; then
    render "$HERE/nginx/$site.conf" > "/etc/nginx/sites-available/kiosk-$site.conf"
  fi
  ln -sf "/etc/nginx/sites-available/kiosk-$site.conf" "/etc/nginx/sites-enabled/kiosk-$site.conf"
done
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx >/dev/null && systemctl reload-or-restart nginx

say "Firewall: only SSH, http and https come in"
# Some hosts (Hetzner Cloud) have a firewall in their console; others (Contabo) have none, so the server keeps its
# own. SSH is allowed first, on the port sshd really uses, so this can never lock anyone out.
command -v ufw >/dev/null || apt-get install -y -q ufw >/dev/null
ssh_port="$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2; exit}')"
ufw allow "${ssh_port:-22}/tcp" comment ssh >/dev/null
ufw allow 80/tcp comment http >/dev/null
ufw allow 443/tcp comment https >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1p;/ALLOW/p'

say "SSH: keys only"
if [ -s /root/.ssh/authorized_keys ]; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-kiosk.conf
  sshd -t && systemctl try-reload-or-restart ssh
  echo "Password logins over SSH are off; keys only."
else
  echo "No SSH key for root: leaving SSH as it is."
fi

say "Done"
echo "Next: push-secrets.sh, then deploy.sh, then enable-https.sh (once the DNS records point here)."
