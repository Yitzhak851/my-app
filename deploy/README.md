# Deploying to AWS

The whole app on one EC2 instance: nginx in front, gunicorn behind it, MySQL on
the same box. It fits comfortably in the free tier and there is one moving part
to understand instead of five.

Everything here was tested first — nginx, gunicorn with three workers, the
agents as their own process, MySQL, HTTPS with a real certificate and `Secure`
session cookies — and the 35-check browser walkthrough (`npm run verify`) was
run against that stack, not against the development servers. The traps called
out below are the ones that actually bit during that run.

---

## The shape of it

```
                    ┌──────────────────────── EC2 instance ─────────────────────┐
   browser  ─443─►  │  nginx                                                    │
                    │    /                → /var/www/ybo        (the React app) │
                    │    /api/            → 127.0.0.1:5000      (gunicorn)      │
                    │    /static/uploads/ → /opt/ybo/backend/uploads (from disk) │
                    │                                                           │
                    │  ybo-api.service     gunicorn, 3 workers × 2 threads       │
                    │  ybo-agents.service  the simulation, exactly one process   │
                    │  mysql               localhost only                        │
                    └───────────────────────────────────────────────────────────┘
```

**One origin.** The API is not on its own domain or its own port — it is
`/api` on the same host as the app. That removes CORS, preflights and
third-party-cookie rules in one go, and makes the session cookie a first-party
cookie again. It is also why the frontend is built with `VITE_API_BASE_URL=/api`
and not with a hostname: nothing about where it is deployed is compiled into the
bundle.

**Two services, not one.** gunicorn runs several workers. A scheduler started
inside the Flask app would start once *per worker*, so the agents would act
three times as fast on a three-worker box — and the rate would change silently
whenever the worker count did. `ybo-agents.service` owns the simulation, alone.

---

## 1. The instance

EC2 → Launch instance:

| | |
|---|---|
| AMI | Ubuntu Server 22.04 LTS or 24.04 LTS |
| Type | `t3.micro` (or `t2.micro` — both are free-tier eligible) |
| Storage | 16 GB gp3. The default 8 GB is tight once npm and pip have run |
| Key pair | create one and keep the `.pem` file — it is the only way in |

Security group — **inbound**:

| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | **My IP** | not `0.0.0.0/0`; an open SSH port is scanned within minutes |
| HTTP | 80 | `0.0.0.0/0` | the site, and how certbot proves you own the domain |
| HTTPS | 443 | `0.0.0.0/0` | the site |

**Do not open 3306 or 5000.** MySQL binds to localhost and gunicorn binds to
`127.0.0.1` — nothing outside needs to reach either, and opening them exposes
the database and the API with the proxy bypassed.

```bash
chmod 400 my-key.pem
ssh -i my-key.pem ubuntu@<the public IPv4 address>
```

---

## 2. Prerequisites on the instance

**Add swap first.** A `t2.micro` / `t3.micro` has 1 GB of RAM and the Vite
build needs more than that — without swap `npm ci` is killed by the OOM killer
partway through, which looks like a random failure:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # survives a reboot
free -h
```

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-venv python3-pip nginx mysql-server git rsync
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Node has to be 18 or newer; Ubuntu's own `nodejs` package is older, which is why
it comes from NodeSource.

---

## 3. The database

```bash
sudo mysql_secure_installation      # set a root password, answer Y to the rest
```

Then create the database and a user for the app. Give it a password of its own —
the app must not connect as root:

```bash
sudo mysql
```

```sql
CREATE DATABASE social_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ybo'@'localhost' IDENTIFIED BY 'a-long-random-password';
GRANT ALL PRIVILEGES ON social_app.* TO 'ybo'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Confirm MySQL is not listening to the world — the address must be `127.0.0.1`:

```bash
sudo ss -lntp | grep 3306
```

> **RDS instead?** Create the instance in the same VPC, set its security group
> to accept 3306 *from the EC2 instance's security group only*, and point
> `DB_HOST` at the endpoint. Nothing else changes.

---

## 4. The application

```bash
git clone https://github.com/Yitzhak851/my-app.git
cd my-app
sudo bash deploy/deploy.sh
```

The first run stops after creating `/opt/ybo/backend/.env` from the template,
because it cannot invent your passwords. Fill it in:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"   # for SECRET_KEY
sudo nano /opt/ybo/backend/.env
```

Set `DB_PASSWORD`, `SECRET_KEY`, and put your domain in `CORS_ORIGINS`,
`FRONTEND_URL` and `MAIL_FROM`. Then run it again:

```bash
sudo bash deploy/deploy.sh
```

It creates the `ybo` service account, installs the Python dependencies, applies
`db/schema.sql` (a re-runnable migration — it never drops anything), seeds the
ten agents, builds the frontend with `VITE_API_BASE_URL=/api`, installs the
nginx site and both systemd units, starts everything, and then checks that it
works. It is also the **update** path: `git pull && sudo bash deploy/deploy.sh`.

Set your domain in the nginx site before asking for a certificate:

```bash
sudo nano /etc/nginx/sites-available/ybo     # server_name your-domain.com;
sudo nginx -t && sudo systemctl reload nginx
```

---

## 5. HTTPS — not optional

Point an A record at the instance's public IP, then:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

certbot edits the nginx site in place to add the certificate and the
HTTP → HTTPS redirect, and installs a renewal timer. Check it:

```bash
sudo certbot renew --dry-run
```

**Why this is not optional here.** `SESSION_COOKIE_SECURE=True` tells the
browser to send the session cookie over HTTPS only. On a plain-HTTP server the
browser accepts the login response and then silently discards the cookie: the
API log shows `200`, nothing errors, and every page says you are signed out.
There is nothing to find in a log because nothing went wrong on the server. Run
certbot before showing anyone the site.

### No domain?

**Let's Encrypt will not issue a certificate for an `*.amazonaws.com` name** —
those belong to AWS, not to you, and the CA refuses them. So with only the EC2
public DNS name there is no way to get real HTTPS, and the app has to run over
plain HTTP. Set this in `/opt/ybo/backend/.env`:

```bash
SESSION_COOKIE_SECURE=False
```

then `sudo systemctl restart ybo-api`. The app prints a warning at startup that
the cookie is travelling in the clear, which is true and is the trade-off you
are making. Everything works; the session is simply not protected in transit.

Getting a domain is cheap (a `.click` or `.link` is a couple of dollars a year,
and Route 53 or any registrar will do). Point an A record at the instance,
run certbot, and set `SESSION_COOKIE_SECURE=True` back. If you are submitting
this for a course, a domain with HTTPS is worth the two dollars.

---

## 6. Check it

```bash
curl -I https://your-domain.com                 # 200, and a TLS certificate
curl https://your-domain.com/api/health         # {"message":"API is working"}
sudo systemctl status ybo-api ybo-agents
sudo journalctl -u ybo-agents -f                # watch the agents act
```

The real check is the browser walkthrough, run from your own machine against
the deployed site:

```bash
npm i -D playwright && npx playwright install chromium
APP_URL=https://your-domain.com API_URL=https://your-domain.com/api npm run verify
```

34 checks: signing up, publishing, uploading an image, liking, commenting,
following, reporting, moderating, banning, the agents, the grid layout, phone
width, and signing out. It creates a few accounts and posts as it goes, so run
it before you care about the contents of the database.

---

## Day to day

```bash
sudo journalctl -u ybo-api -f            # the API log
sudo journalctl -u ybo-agents -f         # the simulation
sudo systemctl restart ybo-api           # after an .env change
cd ~/my-app && git pull && sudo bash deploy/deploy.sh    # deploy an update
sudo bash deploy/deploy.sh --skip-build  # config-only change, much faster
```

The password reset writes its link to the API log by default
(`MAIL_BACKEND=console`), which is enough to demonstrate the flow without a mail
server:

```bash
sudo journalctl -u ybo-api -f | grep -A5 'EMAIL'
```

**Back up the database.** A snapshot of the instance is not a backup of a
running MySQL:

```bash
sudo mysqldump --single-transaction social_app | gzip > ~/social_app-$(date +%F).sql.gz
```

---

## When it does not work

| What you see | What it usually is |
|---|---|
| **502 Bad Gateway** | gunicorn is not running. `sudo journalctl -u ybo-api -n 50`. Most often the app refused to start because `SECRET_KEY` or `DB_PASSWORD` is unset — it says so in the log. |
| **The site loads but nothing has any data** | The API cannot reach MySQL. `sudo systemctl status mysql`, then check `DB_PASSWORD` in `.env`. |
| **Signing in appears to work but every page says signed out** | No HTTPS, and `SESSION_COOKIE_SECURE=True`. The browser is discarding the cookie. Run certbot. |
| **Every API call 404s, and the network tab shows `localhost:5000`** | The frontend was built without `VITE_API_BASE_URL=/api`. Re-run `deploy.sh` — it refuses to publish a bundle containing `localhost:5000`. |
| **Refreshing on `/users/3` gives 404** | The `try_files ... /index.html` fallback is missing from the nginx site. |
| **Images are broken; the nginx error log says `stat() failed (13: Permission denied)`** | nginx needs execute permission on *every* directory on the way to the file, not just the last one. `sudo chmod 755 /opt/ybo /opt/ybo/backend /opt/ybo/backend/uploads`. |
| **The agents run at several times the configured rate** | `AGENTS_ENABLED=True` in the API's environment as well as in the agents service, so every gunicorn worker has its own scheduler. It belongs to `ybo-agents.service` alone. |
| **Uploading a large image fails with "unexpected end of JSON"** | nginx rejected the body before the app saw it and answered with an HTML error page. `client_max_body_size` must be above the app's 5 MB limit. |
| **`npm ci` is killed during the build** | A `t2.micro` has 1 GB of RAM. Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`. |

---

## Cost

One `t3.micro`, 16 GB of storage and a modest amount of traffic sits inside the
12-month free tier. After it expires this is roughly $8–10 a month. An idle
instance still costs money — stop it when you are not demonstrating it, and
remember the public IP changes on restart unless you attach an Elastic IP.
