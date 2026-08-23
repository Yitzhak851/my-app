#!/usr/bin/env bash
#
# Set up the database on this machine, end to end, with nothing to fill in.
#
#     sudo bash deploy/setup-local-db.sh
#
# Installs the server, starts it, creates the database and the application's
# user with a freshly generated password, and writes that password into
# /opt/ybo/backend/.env. Then it checks that the application's user can
# actually sign in.
#
# Why this exists: the manual version is four commands across two different
# prompts — bash for the install, then the SQL client for CREATE DATABASE —
# and every step has a value in it that has to be substituted by hand. That is
# a lot of places to go wrong for something with exactly one correct outcome.
#
# The password is generated here and never printed. It goes straight into
# .env (0600, owned by the service user) and nowhere else — not into your shell
# history, not onto the screen, not into a chat window.
#
# Safe to run again: it creates nothing that already exists and never drops
# anything. Re-running resets the application user's password to a new one and
# updates .env to match, which is also how you recover from having lost it.
#
# For RDS instead, do not run this. Put the endpoint in DB_HOST in .env and
# see deploy/README.md.

set -euo pipefail

APP_DIR=/opt/ybo
ENV_FILE="$APP_DIR/backend/.env"
DB_NAME=social_app
DB_USER=ybo

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31mFAILED:\033[0m %s\n\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run with sudo: sudo bash deploy/setup-local-db.sh"
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found.
    Run this first, and let it create the file:
        sudo bash deploy/deploy.sh"

# ── which distribution ───────────────────────────────────────────────────────
if command -v dnf >/dev/null; then
  SERVER_PACKAGE=mariadb105-server
  DB_SERVICE=mariadb
  INSTALL="dnf install -y"
else
  SERVER_PACKAGE=mysql-server
  DB_SERVICE=mysql
  INSTALL="apt-get install -y"
fi

# ── the server ───────────────────────────────────────────────────────────────
step "Database server"
if systemctl list-unit-files 2>/dev/null | grep -q "^$DB_SERVICE.service"; then
  ok "$SERVER_PACKAGE already installed"
else
  # shellcheck disable=SC2086
  $INSTALL $SERVER_PACKAGE >/dev/null || die "could not install $SERVER_PACKAGE"
  ok "installed $SERVER_PACKAGE"
fi

systemctl enable --now "$DB_SERVICE" >/dev/null 2>&1 || true

# The service reports "started" before the socket is ready to take queries, so
# a CREATE DATABASE immediately afterwards can fail on a slow instance.
for _ in $(seq 1 30); do
  mysqladmin ping >/dev/null 2>&1 && break
  sleep 1
done
mysqladmin ping >/dev/null 2>&1 \
  || die "$DB_SERVICE is installed but not answering.
    Look at why:  sudo systemctl status $DB_SERVICE"
ok "$DB_SERVICE is running"

# ── the database and the user ────────────────────────────────────────────────
step "Database and user"

# Generated here, shown nowhere. 24 bytes of urandom, base64, with the
# characters that would need quoting in a connection string removed.
DB_PASSWORD=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | head -c 32)
[[ ${#DB_PASSWORD} -ge 24 ]] || die "could not generate a password"

# Idempotent on purpose: IF NOT EXISTS creates nothing that is already there,
# and ALTER USER sets the password whether the user is new or not — which is
# what makes re-running this the way to recover a lost password.
mysql <<SQL || die "the SQL failed. Run 'sudo mysql' and check you can connect."
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
ok "database '$DB_NAME' and user '$DB_USER' ready"

# ── write it into .env ───────────────────────────────────────────────────────
step "Configuration"

# Through python rather than sed: a generated password can contain characters
# sed would treat as part of the replacement expression, and the failure would
# be a silently wrong password in the file.
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")

DB_PASSWORD="$DB_PASSWORD" SECRET_KEY="$SECRET_KEY" python3 - "$ENV_FILE" <<'PYEOF'
import os
import re
import sys

path = sys.argv[1]
lines = open(path).read().splitlines()

wanted = {
    'DB_HOST': 'localhost',
    'DB_USER': 'ybo',
    'DB_NAME': 'social_app',
    'DB_PASSWORD': os.environ['DB_PASSWORD'],
}

# The signing key is only replaced when it is missing or still the placeholder.
# Overwriting a real one would sign out everyone who is currently signed in,
# every time this script is run.
current_secret = ''
for line in lines:
    if line.startswith('SECRET_KEY='):
        current_secret = line.split('=', 1)[1].strip()

placeholder = ('', 'dev-key', 'change-me-generate-a-random-value')
if current_secret in placeholder:
    wanted['SECRET_KEY'] = os.environ['SECRET_KEY']
    print('    generated a new SECRET_KEY')
else:
    print('    SECRET_KEY already set — left alone')

out, seen = [], set()
for line in lines:
    match = re.match(r'^([A-Z_]+)=', line)
    if match and match.group(1) in wanted:
        key = match.group(1)
        out.append(f'{key}={wanted[key]}')
        seen.add(key)
    else:
        out.append(line)

for key, value in wanted.items():
    if key not in seen:
        out.append(f'{key}={value}')

open(path, 'w').write('\n'.join(out) + '\n')
PYEOF

chmod 600 "$ENV_FILE"
id -u ybo >/dev/null 2>&1 && chown ybo:ybo "$ENV_FILE"
ok "written to $ENV_FILE (0600, not printed anywhere)"

# ── does it actually work ────────────────────────────────────────────────────
step "Checking"

# As the application's user, over the same path the application uses — not as
# root, which would prove nothing about whether the app can connect.
ENV_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
MYSQL_PWD="$ENV_PASSWORD" mysql -h localhost -u "$DB_USER" "$DB_NAME" \
  -e "SELECT 1" >/dev/null 2>&1 \
  || die "the user was created but cannot sign in. Something is out of step —
    run this script again, and if it persists check: sudo systemctl status $DB_SERVICE"
ok "'$DB_USER' can sign in to '$DB_NAME'"

step "Done"
echo "    The database is ready and .env is filled in. Next:"
echo
echo "        sudo bash deploy/deploy.sh"
echo
echo "    Nothing here needs to be remembered — the password lives in"
echo "    $ENV_FILE. If you ever need a new one, run this script again."
echo

# Re-running rotates the password, and a service started with the old one keeps
# using it until it is restarted — which looks like the database suddenly
# rejecting a correct password.
if systemctl is-active --quiet ybo-api 2>/dev/null; then
  warn "ybo-api is already running with the previous password. Restart it:"
  echo "        sudo systemctl restart ybo-api ybo-agents"
  echo
fi
