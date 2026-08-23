#!/usr/bin/env bash
#
# phpMyAdmin, served by the nginx that is already running the app.
#
#     sudo bash deploy/phpmyadmin.sh
#
# The course hands out an installer that brings up **Apache** on port 80 and
# points phpMyAdmin at RDS. On this machine nginx already owns port 80, so
# whichever service starts second fails to bind — and the usual symptom is
# "phpMyAdmin does not load" with no obvious cause. This does the same job with
# the server that is already here: php-fpm behind nginx, one port, one web
# server, and it can sit behind the same HTTPS certificate as the app.
#
# Three things it does that are worth knowing about:
#
#   1. phpMyAdmin is installed to /usr/share/phpmyadmin, NOT under /var/www/ybo.
#      deploy.sh rsyncs the web root with --delete on every deploy; anything
#      parked there would be erased the next time the app is updated.
#
#   2. Access is restricted by IP. A database console reachable from the whole
#      internet is one of the most attacked URLs there is, and "it is only for
#      the course" is not a property the internet can see.
#
#   3. The RDS endpoint is read from the app's own .env, so phpMyAdmin and the
#      application cannot end up looking at two different databases.

set -euo pipefail

APP_DIR=/opt/ybo
ENV_FILE="$APP_DIR/backend/.env"
PMA_DIR=/usr/share/phpmyadmin
NGINX_SNIPPET=/etc/nginx/conf.d/ybo-phpmyadmin.conf

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31mFAILED:\033[0m %s\n\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run with sudo: sudo bash deploy/phpmyadmin.sh"
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found — run deploy/deploy.sh first."

# ── who may reach it ─────────────────────────────────────────────────────────
step "Access"

# Default to whoever is connected over SSH right now: that is the person
# running this, and it is almost always the right answer.
#
# sudo does not pass SSH_CLIENT through, so the obvious way of reading it finds
# nothing when this is run the way it is meant to be run. `who am i` prints the
# connecting address in parentheses and survives sudo, so it is the fallback.
DEFAULT_IP="${SSH_CLIENT:-}"
DEFAULT_IP="${DEFAULT_IP%% *}"
[[ -z "$DEFAULT_IP" ]] && DEFAULT_IP=$(echo "${SSH_CONNECTION:-}" | awk '{print $1}')
[[ -z "$DEFAULT_IP" ]] && DEFAULT_IP=$(who am i 2>/dev/null | sed -n 's/.*(\([0-9.]*\)).*/\1/p' | head -1)
ALLOW_FROM="${ALLOW_FROM:-$DEFAULT_IP}"

if [[ -z "$ALLOW_FROM" ]]; then
  die "Could not work out which address to allow.
    Pass it explicitly:
        sudo ALLOW_FROM=<your public IP> bash deploy/phpmyadmin.sh
    Find yours with:  curl -s ifconfig.me
    ALLOW_FROM=any opens it to everyone — do not, unless you have a reason."
fi

if [[ "$ALLOW_FROM" == "any" ]]; then
  warn "opening phpMyAdmin to the entire internet. This is a database console."
  ACCESS_RULES="    # ALLOW_FROM=any was passed. Anyone can reach this."
else
  ok "restricted to $ALLOW_FROM"
  ACCESS_RULES="    allow $ALLOW_FROM;
    deny all;"
fi

# ── where the database is ────────────────────────────────────────────────────
step "Database"
set -a; # shellcheck disable=SC1090
source "$ENV_FILE"; set +a
DB_HOST="${DB_HOST:-localhost}"
ok "pointing phpMyAdmin at $DB_HOST — the same database the app uses"

# ── packages ─────────────────────────────────────────────────────────────────
step "PHP"
if command -v dnf >/dev/null; then
  dnf install -y php-fpm php-mysqlnd php-json php-mbstring php-xml php-zip curl tar >/dev/null
  PHP_POOL=/etc/php-fpm.d/www.conf
  PHP_SERVICE=php-fpm
  PHP_SOCKET=/run/php-fpm/ybo.sock
else
  apt-get update -qq >/dev/null
  apt-get install -y php-fpm php-mysql php-json php-mbstring php-xml php-zip curl >/dev/null
  PHP_POOL=$(ls /etc/php/*/fpm/pool.d/www.conf 2>/dev/null | head -1)
  PHP_SERVICE=$(systemctl list-unit-files | grep -o 'php[0-9.]*-fpm.service' | head -1)
  PHP_SERVICE="${PHP_SERVICE%.service}"
  PHP_SOCKET=/run/php/ybo.sock
fi
[[ -n "$PHP_POOL" && -f "$PHP_POOL" ]] || die "could not find the php-fpm pool configuration"
ok "php-fpm installed ($PHP_SERVICE)"

# ── php-fpm must speak to nginx, not to Apache ───────────────────────────────
step "Connecting php-fpm to nginx"
# On the RHEL family php-fpm ships configured for Apache: it runs as the
# 'apache' user and its socket is owned by that user. nginx then gets
# "Permission denied" on the socket and answers 502, which looks like php-fpm
# is not running at all.
cp "$PHP_POOL" "$PHP_POOL.ybo-backup" 2>/dev/null || true
python3 - "$PHP_POOL" "$PHP_SOCKET" <<'PYEOF'
import re, sys
path, socket = sys.argv[1], sys.argv[2]
conf = open(path).read()
settings = {
    'user': 'nginx' if '/php-fpm.d/' in path else 'www-data',
    'group': 'nginx' if '/php-fpm.d/' in path else 'www-data',
    'listen': socket,
    'listen.owner': 'nginx' if '/php-fpm.d/' in path else 'www-data',
    'listen.group': 'nginx' if '/php-fpm.d/' in path else 'www-data',
    'listen.mode': '0660',
}
for key, value in settings.items():
    pattern = re.compile(rf'^;?\s*{re.escape(key)}\s*=.*$', re.M)
    line = f'{key} = {value}'
    conf = pattern.sub(line, conf, count=1) if pattern.search(conf) else conf + f'\n{line}\n'
open(path, 'w').write(conf)
print(f'  pool: user/group and socket set for nginx ({socket})')
PYEOF

systemctl enable --now "$PHP_SERVICE" >/dev/null 2>&1 || true
systemctl restart "$PHP_SERVICE"
[[ -S "$PHP_SOCKET" ]] || die "php-fpm did not create $PHP_SOCKET — check: systemctl status $PHP_SERVICE"
ok "php-fpm listening on $PHP_SOCKET"

# ── phpMyAdmin itself ────────────────────────────────────────────────────────
step "phpMyAdmin"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# PMA_TARBALL lets an already-downloaded archive be used instead — for a
# machine with no outbound internet access, and for testing this script.
if [[ -n "${PMA_TARBALL:-}" ]]; then
  [[ -f "$PMA_TARBALL" ]] || die "PMA_TARBALL=$PMA_TARBALL does not exist"
  cp "$PMA_TARBALL" "$TMP/pma.tar.gz"
  ok "using $PMA_TARBALL"
else
  curl -sSLo "$TMP/pma.tar.gz" \
    https://www.phpmyadmin.net/downloads/phpMyAdmin-latest-all-languages.tar.gz \
    || die "could not download phpMyAdmin.
    If this machine has no outbound internet access, fetch the archive
    elsewhere, copy it over, and point at it:
        sudo PMA_TARBALL=/home/ec2-user/phpMyAdmin-latest-all-languages.tar.gz \\
             bash deploy/phpmyadmin.sh"
fi

tar xzf "$TMP/pma.tar.gz" -C "$TMP"
rm -rf "$PMA_DIR"
mv "$TMP"/phpMyAdmin-*-all-languages "$PMA_DIR"
mkdir -p "$PMA_DIR/tmp"
ok "installed to $PMA_DIR"

BLOWFISH=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | head -c 32)
cat > "$PMA_DIR/config.inc.php" <<PHPEOF
<?php
declare(strict_types=1);

// Signs the session cookie. Generated on this machine, never shared.
\$cfg['blowfish_secret'] = '$BLOWFISH';

\$i = 0;
\$i++;

// Read from the application's own .env, so this console and the app can never
// end up pointing at different databases.
\$cfg['Servers'][\$i]['host']            = '$DB_HOST';
\$cfg['Servers'][\$i]['port']            = 3306;
\$cfg['Servers'][\$i]['auth_type']       = 'cookie';
\$cfg['Servers'][\$i]['AllowNoPassword'] = false;

\$cfg['UploadDir'] = '';
\$cfg['SaveDir']   = '';
\$cfg['TempDir']   = '$PMA_DIR/tmp';
PHPEOF

# The user nginx actually runs as, read from its own config. `\w+` is not
# enough here: it stops at the hyphen and turns "www-data" into "www", and
# `chown root:www` then fails with "invalid group".
WEB_USER=$(sed -n 's/^[[:space:]]*user[[:space:]]\+\([A-Za-z0-9_-]\+\).*/\1/p' \
             /etc/nginx/nginx.conf | head -1)
WEB_USER="${WEB_USER:-nginx}"
id -u "$WEB_USER" >/dev/null 2>&1 || die "nginx is configured to run as '$WEB_USER', which does not exist"
chown -R root:"$WEB_USER" "$PMA_DIR"
chmod 750 "$PMA_DIR"
chmod 640 "$PMA_DIR/config.inc.php"
chown "$WEB_USER:$WEB_USER" "$PMA_DIR/tmp"
chmod 700 "$PMA_DIR/tmp"
ok "configured for $DB_HOST"

# ── nginx ────────────────────────────────────────────────────────────────────
step "nginx"
cat > "$NGINX_SNIPPET" <<NGINXEOF
# phpMyAdmin, added by deploy/phpmyadmin.sh.
#
# A separate server block on port 8080 rather than a location inside the app's
# site. Two reasons: certbot rewrites the app's site file and would have to be
# kept from touching this, and a database console with its own port is easy to
# close in the security group without touching the app.
server {
    listen 8080;
    server_name _;

    root $PMA_DIR;
    index index.php;

    server_tokens off;
    add_header X-Frame-Options DENY always;
    add_header X-Robots-Tag "noindex, nofollow" always;

$ACCESS_RULES

    # A database dump can be large in both directions.
    client_max_body_size 64m;

    location / {
        try_files \$uri \$uri/ =404;
    }

    location ~ ^/(.+\.php)\$ {
        try_files \$uri =404;
        fastcgi_pass unix:$PHP_SOCKET;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_read_timeout 300;
    }

    # Never serve these as text, whatever else changes.
    location ~ ^/(config\.inc\.php|libraries|templates|tmp)/ {
        deny all;
    }
}
NGINXEOF

nginx -t >/dev/null 2>&1 || die "nginx configuration is invalid — run: sudo nginx -t"
systemctl reload nginx
ok "serving on port 8080"

# ── does it actually work ────────────────────────────────────────────────────
step "Checking"
# One request through the whole chain — nginx, the socket, php-fpm, the
# extensions — because each link fails differently and all of them look the
# same from the browser: a blank page. A missing mysqli in particular gives
# phpMyAdmin nothing to say and no error to show.
PROBE="$PMA_DIR/_ybo_probe.php"
cat > "$PROBE" <<'PROBEEOF'
<?php
echo 'php=', PHP_VERSION,
     ' mysqli=', extension_loaded('mysqli') ? 'yes' : 'NO',
     ' mbstring=', extension_loaded('mbstring') ? 'yes' : 'NO', "\n";
PROBEEOF
chown root:"$WEB_USER" "$PROBE"
chmod 640 "$PROBE"

PROBE_OUT=$(curl -s -m 10 --resolve "localhost:8080:127.0.0.1" \
            --interface 127.0.0.1 http://127.0.0.1:8080/_ybo_probe.php 2>/dev/null || true)
rm -f "$PROBE"

case "$PROBE_OUT" in
  *"mysqli=yes"*"mbstring=yes"*)
    ok "${PROBE_OUT% }" ;;
  *"mysqli=NO"*)
    die "PHP is running but the mysqli extension is missing — phpMyAdmin would
    show a blank page. Install it and run this again:
        sudo dnf install -y php-mysqlnd     # Amazon Linux
        sudo apt install -y php-mysql       # Ubuntu" ;;
  "")
    warn "could not reach the probe page from this machine."
    warn "If the allow-list does not include 127.0.0.1 that is expected; check from your browser."
    ;;
  *)
    warn "unexpected answer from the probe page: ${PROBE_OUT:0:120}" ;;
esac

# ── SELinux ──────────────────────────────────────────────────────────────────
if command -v getenforce >/dev/null && [[ "$(getenforce 2>/dev/null)" == "Enforcing" ]]; then
  step "SELinux"
  setsebool -P httpd_can_network_connect 1 2>/dev/null || true
  setsebool -P httpd_can_network_connect_db 1 2>/dev/null || true
  command -v restorecon >/dev/null && restorecon -R "$PMA_DIR" 2>/dev/null || true
  ok "policy adjusted"
fi

# ── done ─────────────────────────────────────────────────────────────────────
TOKEN=$(curl -s -m 2 -X PUT "http://169.254.169.254/latest/api/token" \
        -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
PUBLIC_IP=$(curl -s -m 2 -H "X-aws-ec2-metadata-token: $TOKEN" \
        http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
# The metadata service is not always reachable, and when it is not, curl
# returns whatever the intermediary said — which is not an address. Print a
# placeholder rather than a confusing URL built from an error message.
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || PUBLIC_IP="<the EC2 public IP>"

step "Done"
echo
echo "    http://$PUBLIC_IP:8080/"
echo
echo "    Sign in with the database user — for RDS that is usually the master"
echo "    user ('admin') and its password, or the app's own DB_USER."
echo
echo "    Two things left to do:"
echo
echo "      1. Open port 8080 in the EC2 security group:"
echo "         Type: Custom TCP | Port: 8080 | Source: My IP"
echo "         Not 0.0.0.0/0 — nginx already refuses anything but $ALLOW_FROM,"
echo "         but there is no reason to advertise the port at all."
echo
echo "      2. When your address changes, update the rule:"
echo "         sudo ALLOW_FROM=<new IP> bash deploy/phpmyadmin.sh"
echo
echo "    The app itself is untouched and still on port 80."
echo
