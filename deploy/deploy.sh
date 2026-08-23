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
INSTALL_DEPS=false
for arg in "$@"; do
  case "$arg" in
    --skip-build)   SKIP_BUILD=true ;;
    --no-smoke)     RUN_SMOKE=false ;;
    --install-deps) INSTALL_DEPS=true ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

step()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()    { printf '    \033[32m✓\033[0m %s\n' "$1"; }
warn()  { printf '    \033[33m!\033[0m %s\n' "$1"; }
die()   { printf '\n\033[31mFAILED:\033[0m %s\n\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run with sudo: sudo bash deploy/deploy.sh"

# ── which distribution is this ───────────────────────────────────────────────
#
# Ubuntu and Amazon Linux disagree about almost everything this script touches:
# the package manager, the user nginx runs as, where an nginx site lives, and
# what the MySQL package and service are called. Everything below reads these
# five variables instead of assuming one of them.
#
# YBO_FAMILY=debian|rhel forces the choice, which is how the branches are
# tested without two machines.
detect_family() {
  if [[ -n "${YBO_FAMILY:-}" ]]; then echo "$YBO_FAMILY"; return; fi
  local id="" like=""
  if [[ -r /etc/os-release ]]; then
    id=$(. /etc/os-release && echo "${ID:-}")
    like=$(. /etc/os-release && echo "${ID_LIKE:-}")
  fi
  case "$id $like" in
    *debian*|*ubuntu*) echo debian ;;
    *rhel*|*fedora*|*amzn*|*centos*) echo rhel ;;
    *) echo unknown ;;
  esac
}

FAMILY=$(detect_family)
case "$FAMILY" in
  debian)
    NODE_HINT='curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs'
    PKG_INSTALL="apt-get install -y"
    PKG_REFRESH="apt-get update"
    WEB_USER=www-data
    NGINX_SITE=/etc/nginx/sites-available/ybo
    DB_SERVICE=mysql
    DB_SERVER_PACKAGES="mysql-server"
    # The client is always needed — it is what applies db/schema.sql, whether
    # the database is on this machine or on RDS.
    DB_CLIENT_PACKAGES="mysql-client"
    BASE_PACKAGES="python3 python3-venv python3-pip nginx git rsync curl mysql-client"
    ;;
  rhel)
    NODE_HINT='sudo dnf install -y nodejs20 nodejs20-npm'
    PKG_INSTALL="dnf install -y"
    PKG_REFRESH="dnf makecache"
    WEB_USER=nginx
    # No sites-available on this family; nginx.conf includes conf.d/*.conf.
    NGINX_SITE=/etc/nginx/conf.d/ybo.conf
    # Amazon Linux 2023 has no mysql-server package. MariaDB is the drop-in
    # here: same wire protocol, same client, and the connector the app uses
    # talks to it without a change.
    DB_SERVICE=mariadb
    DB_SERVER_PACKAGES="mariadb105-server"
    DB_CLIENT_PACKAGES="mariadb105"
    BASE_PACKAGES="python3 python3-pip nginx git rsync tar mariadb105"
    ;;
  *)
    die "Cannot tell which distribution this is (no usable /etc/os-release).
    Force it if you know:  sudo YBO_FAMILY=debian bash deploy/deploy.sh"
    ;;
esac

step "System"
ok "$FAMILY family — nginx runs as '$WEB_USER', database service '$DB_SERVICE'"

# ── prerequisites ────────────────────────────────────────────────────────────
step "Checking what is installed"

install_prerequisites() {
  step "Installing prerequisites"
  $PKG_REFRESH >/dev/null 2>&1 || true
  # shellcheck disable=SC2086
  $PKG_INSTALL $BASE_PACKAGES || die "could not install: $BASE_PACKAGES"

  # Only the CLIENT here. Whether a database server belongs on this machine
  # depends on DB_HOST, which lives in .env and has not been read yet — and
  # installing MySQL on a box that talks to RDS is a service running for
  # nothing, on a host with 1 GB of memory.
  if ! command -v mysql >/dev/null; then
    # shellcheck disable=SC2086
    $PKG_INSTALL $DB_CLIENT_PACKAGES || warn "could not install $DB_CLIENT_PACKAGES"
  fi

  if ! command -v node >/dev/null; then
    if [[ "$FAMILY" == debian ]]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      $PKG_INSTALL nodejs
    else
      # Amazon Linux 2023 ships node 20 as its own package. The plain
      # "nodejs" package there is 18, which also works, but pin the newer one.
      $PKG_INSTALL nodejs20 nodejs20-npm 2>/dev/null || $PKG_INSTALL nodejs npm
      # The nodejs20 package installs node20/npm20; make plain names work.
      [[ -x /usr/bin/node ]] || ln -sf /usr/bin/node-20 /usr/bin/node 2>/dev/null || true
      [[ -x /usr/bin/npm ]]  || ln -sf /usr/bin/npm-20  /usr/bin/npm  2>/dev/null || true
    fi
  fi
  ok "prerequisites installed"
}

missing=()
for cmd in python3 node npm nginx rsync; do
  command -v "$cmd" >/dev/null || missing+=("$cmd")
done
python3 -c 'import venv' 2>/dev/null || missing+=("python3-venv")

if ((${#missing[@]})); then
  if [[ "$INSTALL_DEPS" == true ]]; then
    install_prerequisites
  else
    die "Missing: ${missing[*]}

    Let this script install them:
        sudo bash deploy/deploy.sh --install-deps

    Or do it yourself on $FAMILY:
        sudo $PKG_REFRESH
        sudo $PKG_INSTALL $BASE_PACKAGES
        $NODE_HINT"
  fi
fi

missing=()
for cmd in python3 node npm nginx rsync; do
  command -v "$cmd" >/dev/null || missing+=("$cmd")
done
((${#missing[@]})) && die "still missing after installing: ${missing[*]}"

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
step "Database"

DB_HOST="${DB_HOST:-localhost}"
case "$DB_HOST" in
  localhost|127.0.0.1|::1) DB_IS_LOCAL=true ;;
  *)                       DB_IS_LOCAL=false ;;
esac

if [[ "$DB_IS_LOCAL" == true ]]; then
  ok "database on this machine ($DB_HOST)"

  # Only now is it known that a server belongs here.
  if ! systemctl list-unit-files 2>/dev/null | grep -q "^$DB_SERVICE.service"; then
    if [[ "$INSTALL_DEPS" == true ]]; then
      # shellcheck disable=SC2086
      $PKG_INSTALL $DB_SERVER_PACKAGES || die "could not install $DB_SERVER_PACKAGES"
    else
      die "DB_HOST is '$DB_HOST' but no database server is installed here.
    Install one:
        sudo $PKG_INSTALL $DB_SERVER_PACKAGES
        sudo systemctl enable --now $DB_SERVICE
    ...or point DB_HOST at your RDS endpoint in $ENV_FILE."
    fi
  fi
  systemctl enable --now "$DB_SERVICE" >/dev/null 2>&1 || true
else
  ok "database is remote ($DB_HOST) — nothing to install or run here"

  # A wrong security group is the usual reason this fails, and the error from
  # the client further down ("Can't connect") does not say which of the many
  # possible reasons it was. Test the socket first and name the likely cause.
  if ! timeout 5 bash -c "echo > /dev/tcp/$DB_HOST/3306" 2>/dev/null; then
    die "cannot reach $DB_HOST on port 3306.

    Almost always the RDS security group. Fix it in the console:
        RDS > your database > Connectivity & security > the VPC security group
        Edit inbound rules > Add rule
        Type: MySQL/Aurora (3306)
        Source: the EC2 instance's security group  (NOT 0.0.0.0/0)

    Also worth checking: is the instance status 'Available' rather than stopped,
    and is it in the same VPC as this EC2 instance?"
  fi
  ok "$DB_HOST answers on port 3306"
fi

step "Database schema"
# db/schema.sql is written as a re-runnable migration: it creates what is
# missing and leaves existing tables and their data alone. Running it on an
# established database is a no-op, which is what makes this script safe to
# repeat on every deploy.
if MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -u "$DB_USER" \
     -e "SELECT 1" "$DB_NAME" >/dev/null 2>&1; then
  MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -u "$DB_USER" \
    "$DB_NAME" < "$APP_DIR/db/schema.sql"
  ok "schema applied to '$DB_NAME' on $DB_HOST"
elif [[ "$DB_IS_LOCAL" == true ]]; then
  die "cannot connect as '$DB_USER'. Create the database and the user first:
        sudo mysql -e \"CREATE DATABASE IF NOT EXISTS $DB_NAME
                        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\"
        sudo mysql -e \"CREATE USER IF NOT EXISTS '$DB_USER'@'localhost'
                        IDENTIFIED BY '<the password from .env>';\"
        sudo mysql -e \"GRANT ALL ON $DB_NAME.* TO '$DB_USER'@'localhost';\""
else
  die "reached $DB_HOST but could not sign in as '$DB_USER' to database '$DB_NAME'.

    On RDS the master user is usually 'admin'. Either put the master
    credentials in $ENV_FILE, or create a database and user for the app —
    connect with the master account and run:

        mysql -h $DB_HOST -u <master-user> -p
        CREATE DATABASE IF NOT EXISTS $DB_NAME
               CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '<the password from .env>';
        GRANT ALL ON $DB_NAME.* TO '$DB_USER'@'%';

    Note the '%' rather than 'localhost': on RDS the app connects over the
    network, so a user restricted to localhost can never sign in."
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
  chown -R "$WEB_USER:$WEB_USER" "$WEB_ROOT"
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

# nginx serves the uploads directly, as $WEB_USER. Reading a file needs execute
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

if [[ ! -f "$NGINX_SITE" ]]; then
  install -D -m 644 "$APP_DIR/deploy/nginx.conf" "$NGINX_SITE"

  if [[ "$FAMILY" == debian ]]; then
    ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/ybo
    rm -f /etc/nginx/sites-enabled/default
  else
    # The stock nginx.conf on this family carries its own `server` block on
    # port 80 marked default_server. Two default servers is a hard error, and
    # without default_server on ours the stock one answers first and every
    # visitor gets the nginx welcome page instead of the app. So the main
    # config is replaced with one that does nothing but include conf.d.
    if [[ ! -f /etc/nginx/nginx.conf.ybo-backup ]]; then
      cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.ybo-backup
      ok "kept the original main config at /etc/nginx/nginx.conf.ybo-backup"
    fi
    sed "s/@WEB_USER@/$WEB_USER/" "$APP_DIR/deploy/nginx-main.conf" > /etc/nginx/nginx.conf
  fi

  warn "installed the nginx site — set server_name in $NGINX_SITE"
else
  # Left alone on purpose: certbot edits this file in place to add the
  # certificate. Overwriting it on every deploy would undo that every time.
  ok "nginx site already configured — left untouched"
fi

# SELinux, where it is enforcing, blocks nginx from opening a socket to
# gunicorn and from reading files outside its own contexts. The symptom is a
# 502 with "Permission denied" in the error log, which looks nothing like a
# policy problem.
if command -v getenforce >/dev/null && [[ "$(getenforce 2>/dev/null)" == "Enforcing" ]]; then
  setsebool -P httpd_can_network_connect 1 2>/dev/null \
    && ok "SELinux: nginx allowed to reach gunicorn" \
    || warn "SELinux is enforcing and httpd_can_network_connect could not be set"
  command -v restorecon >/dev/null && restorecon -R "$WEB_ROOT" "$APP_DIR/backend/uploads" 2>/dev/null || true
fi

nginx -t >/dev/null 2>&1 || die "nginx configuration is invalid — run: sudo nginx -t"

systemctl enable --now nginx >/dev/null 2>&1 || true
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
  # to be traversable by $WEB_USER. Checked with a real file when there is one.
  sample=$(find "$APP_DIR/backend/uploads" -type f -name '*.*' | head -1 || true)
  if [[ -n "$sample" ]]; then
    check "nginx can serve an uploaded image" \
      "curl -fsS http://127.0.0.1/static/uploads/$(basename "$sample") -o /dev/null"
  else
    sudo -u "$WEB_USER" test -x "$APP_DIR/backend/uploads" \
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
