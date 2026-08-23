#!/usr/bin/env bash
#
# Deploy the app onto this machine. Run it ON the server, from a clone of the
# repository, as a user with sudo.
#
#     git clone https://github.com/Yitzhak851/my-app.git
#     cd my-app
#     sudo bash deploy/deploy.sh
#
# Safe to run again. It is the update path as well as the install path: pull and
# run it, and it rebuilds, restarts and re-checks. Nothing here is destructive —
# it never drops the database and never overwrites an existing .env.
#
#     sudo bash deploy/deploy.sh --skip-build     # config/service change only
#     sudo bash deploy/deploy.sh --no-smoke       # skip the checks at the end

set -euo pipefail

APP_USER=ybo
APP_DIR=/opt/ybo
WEB_ROOT=/var/www/ybo
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SKIP_BUILD=false
RUN_SMOKE=true
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --no-smoke)   RUN_SMOKE=false ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

step()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()    { printf '    \033[32m✓\033[0m %s\n' "$1"; }
warn()  { printf '    \033[33m!\033[0m %s\n' "$1"; }
die()   { printf '\n\033[31mFAILED:\033[0m %s\n\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run with sudo: sudo bash deploy/deploy.sh"

# ── prerequisites ────────────────────────────────────────────────────────────
step "Checking what is installed"
missing=()
for cmd in python3 node npm nginx; do
  command -v "$cmd" >/dev/null || missing+=("$cmd")
done
python3 -c 'import venv' 2>/dev/null || missing+=("python3-venv")

if ((${#missing[@]})); then
  die "Missing: ${missing[*]}
    On Ubuntu:
        sudo apt update
        sudo apt install -y python3 python3-venv python3-pip nginx mysql-server
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs"
fi
ok "python3 $(python3 -V 2>&1 | cut -d' ' -f2), node $(node -v), nginx present"

# ── the service account ──────────────────────────────────────────────────────
step "Service account"
if id "$APP_USER" &>/dev/null; then
  ok "user '$APP_USER' already exists"
else
  # No login shell and no home directory: this account exists to own files and
  # run two processes, not for anyone to log in as.
  useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" "$APP_USER"
  ok "created system user '$APP_USER'"
fi

# ── the code ─────────────────────────────────────────────────────────────────
step "Copying the application to $APP_DIR"
mkdir -p "$APP_DIR"
# Deliberate exclusions: node_modules and venv are rebuilt here; .env is the
# server's own and must never be overwritten by whatever is in the clone;
# uploads are user data that already lives on this machine.
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'venv' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude 'backend/.env' \
  --exclude 'backend/uploads' \
  --exclude 'frontend/dist' \
  "$SOURCE_DIR/" "$APP_DIR/"
mkdir -p "$APP_DIR/backend/uploads"
ok "code in place"

# ── configuration ────────────────────────────────────────────────────────────
step "Configuration"
ENV_FILE="$APP_DIR/backend/.env"
if [[ -f "$ENV_FILE" ]]; then
  ok ".env already exists — left untouched"
else
  cp "$APP_DIR/deploy/env.production.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  warn "created $ENV_FILE from the template"
  echo
  echo "    Fill it in before continuing — the app will not start without a"
  echo "    database password and a real SECRET_KEY. Generate one with:"
  echo
  echo "        python3 -c \"import secrets; print(secrets.token_hex(32))\""
  echo
  echo "    Then run this script again."
  exit 0
fi

# Read DB settings for the schema step without printing the password.
set -a; # shellcheck disable=SC1090
source "$ENV_FILE"; set +a
: "${DB_NAME:?DB_NAME is not set in .env}"
: "${DB_USER:?DB_USER is not set in .env}"
[[ -n "${DB_PASSWORD:-}" ]] || die "DB_PASSWORD is empty in $ENV_FILE"
[[ -n "${SECRET_KEY:-}" && "$SECRET_KEY" != "change-me-generate-a-random-value" ]] \
  || die "SECRET_KEY is not set in $ENV_FILE"
ok "environment looks complete"

# ── python ───────────────────────────────────────────────────────────────────
step "Python dependencies"
if [[ ! -x "$APP_DIR/backend/venv/bin/python" ]]; then
  python3 -m venv "$APP_DIR/backend/venv"
  ok "virtualenv created"
fi
"$APP_DIR/backend/venv/bin/pip" install --upgrade pip --quiet
"$APP_DIR/backend/venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt" --quiet
ok "installed"

# ── database ─────────────────────────────────────────────────────────────────
step "Database schema"
# db/schema.sql is written as a re-runnable migration: it creates what is
# missing and leaves existing tables and their data alone. Running it on an
# established database is a no-op, which is what makes this script safe to
# repeat on every deploy.
if MYSQL_PWD="$DB_PASSWORD" mysql -h "${DB_HOST:-localhost}" -u "$DB_USER" \
     -e "SELECT 1" "$DB_NAME" >/dev/null 2>&1; then
  MYSQL_PWD="$DB_PASSWORD" mysql -h "${DB_HOST:-localhost}" -u "$DB_USER" \
    "$DB_NAME" < "$APP_DIR/db/schema.sql"
  ok "schema applied to '$DB_NAME'"
else
  die "cannot connect to MySQL as '$DB_USER'.
    Create the database and user first:
        sudo mysql -e \"CREATE DATABASE IF NOT EXISTS $DB_NAME
                        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\"
        sudo mysql -e \"CREATE USER IF NOT EXISTS '$DB_USER'@'localhost'
                        IDENTIFIED BY '<the password from .env>';\"
        sudo mysql -e \"GRANT ALL ON $DB_NAME.* TO '$DB_USER'@'localhost';\""
fi

step "Agent accounts"
(cd "$APP_DIR/backend" && sudo -u "$APP_USER" \
  env "$(grep -v '^#' "$ENV_FILE" | grep -v '^$' | tr '\n' ' ')" \
  "$APP_DIR/backend/venv/bin/python" tools/seed_agents.py) \
  && ok "ten agents present" || warn "could not seed the agents — see above"

# ── frontend ─────────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  step "Building the frontend"
  cd "$APP_DIR/frontend"
  npm ci --silent 2>/dev/null || npm install --silent

  # THE important line. Same-origin: the built app calls /api on whatever host
  # it is served from, so there is no hostname compiled into the bundle and no
  # CORS. Building with the development value bakes localhost:5000 into the
  # JavaScript and the deployed site calls the visitor's own machine.
  VITE_API_BASE_URL=/api npm run build --silent

  mkdir -p "$WEB_ROOT"
  rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
  chown -R www-data:www-data "$WEB_ROOT"
  ok "built and published to $WEB_ROOT"

  grep -rq "localhost:5000" "$WEB_ROOT" \
    && die "the build still contains localhost:5000 — VITE_API_BASE_URL did not apply" \
    || ok "no development URL in the bundle"
else
  warn "skipping the frontend build (--skip-build)"
fi

# ── ownership ────────────────────────────────────────────────────────────────
step "Permissions"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$ENV_FILE"

# nginx serves the uploads directly, as www-data. Reading a file needs execute
# permission on EVERY directory on the way to it, not just on the last one — a
# private parent produces a 404 in the browser and
# "stat() failed (13: Permission denied)" in the nginx error log, which does
# not look like a permission problem from the outside at all.
chmod 755 "$APP_DIR" "$APP_DIR/backend" "$APP_DIR/backend/uploads"
find "$APP_DIR/backend/uploads" -type f -exec chmod 644 {} +
ok "owned by $APP_USER, .env is 0600, uploads readable by nginx"

# ── services ─────────────────────────────────────────────────────────────────
step "Services"
cp "$APP_DIR/deploy/ybo-api.service"    /etc/systemd/system/
cp "$APP_DIR/deploy/ybo-agents.service" /etc/systemd/system/
systemctl daemon-reload

if [[ ! -f /etc/nginx/sites-available/ybo ]]; then
  cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/ybo
  ln -sf /etc/nginx/sites-available/ybo /etc/nginx/sites-enabled/ybo
  rm -f /etc/nginx/sites-enabled/default
  warn "installed the nginx site — set server_name in /etc/nginx/sites-available/ybo"
else
  # Left alone on purpose: certbot edits this file in place to add the
  # certificate. Overwriting it on every deploy would undo that every time.
  ok "nginx site already configured — left untouched"
fi

nginx -t >/dev/null 2>&1 || die "nginx configuration is invalid — run: sudo nginx -t"

systemctl enable --now ybo-api ybo-agents >/dev/null 2>&1 || true
systemctl restart ybo-api
systemctl restart ybo-agents
systemctl reload nginx
ok "ybo-api, ybo-agents and nginx are running"

# ── does it actually work ────────────────────────────────────────────────────
if [[ "$RUN_SMOKE" == true ]]; then
  step "Checking that it works"
  sleep 3
  failures=0

  check() {
    if eval "$2" >/dev/null 2>&1; then ok "$1"; else warn "$1 — FAILED"; ((failures++)); fi
  }

  check "the API answers"          "curl -fsS http://127.0.0.1:5000/api/health"
  check "nginx serves the app"     "curl -fsS http://127.0.0.1/ | grep -q '<div id=\"root\"'"
  check "nginx proxies /api"       "curl -fsS http://127.0.0.1/api/health | grep -q 'API is working'"
  check "the database is reachable" "curl -fsS http://127.0.0.1/api/posts/ | head -c 1 | grep -q '\['"
  check "a client-side route resolves" "curl -fsS http://127.0.0.1/users/1 | grep -q '<div id=\"root\"'"
  check "the agents are running"   "systemctl is-active --quiet ybo-agents"

  # nginx reads the uploads directory directly, so every parent directory needs
  # to be traversable by www-data. Checked with a real file when there is one.
  sample=$(find "$APP_DIR/backend/uploads" -type f -name '*.*' | head -1 || true)
  if [[ -n "$sample" ]]; then
    check "nginx can serve an uploaded image" \
      "curl -fsS http://127.0.0.1/static/uploads/$(basename "$sample") -o /dev/null"
  else
    sudo -u www-data test -x "$APP_DIR/backend/uploads" \
      && ok "nginx can reach the uploads directory" \
      || { warn "nginx cannot reach $APP_DIR/backend/uploads"; ((failures++)); }
  fi

  # The one that catches the most confusing production failure: the app is up,
  # the log is clean, and nobody can stay signed in because the browser is
  # discarding a Secure cookie sent over plain HTTP.
  if [[ "${SESSION_COOKIE_SECURE:-True}" =~ ^([Tt]rue|1|[Yy]es)$ ]]; then
    warn "SESSION_COOKIE_SECURE is on — signing in only works over HTTPS."
    echo "        Run certbot now if you have not:"
    echo "            sudo certbot --nginx -d your-domain.example.com"
  fi

  if ((failures)); then
    echo
    warn "$failures check(s) failed. Look at:"
    echo "        sudo journalctl -u ybo-api -n 50 --no-pager"
    echo "        sudo journalctl -u ybo-agents -n 20 --no-pager"
    echo "        sudo tail -50 /var/log/nginx/error.log"
    exit 1
  fi
fi

step "Done"
echo "    The site is being served on port 80 by nginx."
echo
echo "    Log:      sudo journalctl -u ybo-api -f"
echo "    Agents:   sudo journalctl -u ybo-agents -f"
echo "    Restart:  sudo systemctl restart ybo-api"
echo
