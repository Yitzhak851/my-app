# YBO Social Network

A full-stack social network: users sign up, post rich-text content, follow each other,
and read a feed that loads as they scroll.

Built as the final project for the Full Stack course.
**React + Vite** frontend · **Flask** API · **MySQL** database.

---

## Quick start

```bash
git clone https://github.com/Yitzhak851/my-app.git
cd my-app
npm start
```

`npm start` checks your prerequisites, installs both sides, creates `.env` files,
builds the database, and starts both servers. It is safe to re-run at any time.

When it finishes you will see:

```text
  Backend  http://localhost:5000
  Frontend http://localhost:5173
```

Open **http://localhost:5173**.

Demo accounts are seeded — sign in with any of them, password `Password123!`:

| Email | Name |
|---|---|
| `dana@example.com` | Dana Levi |
| `omri@example.com` | Omri Cohen |
| `maya@example.com` | Maya Bar |

### Don't want to install MySQL and Python?

```bash
docker compose up
```

This brings up the database, the API and the frontend together. Nothing but Docker required.

---

## Tech stack

**Frontend** — React 19, Vite 8, React Router 7, Material-UI 9, Quill (rich text),
DOMPurify (HTML sanitizing), Vitest + React Testing Library, Cypress

**Backend** — Python 3.9+, Flask 3, Flask-CORS, mysql-connector-python, bcrypt, python-dotenv

**Database** — MySQL 8 (or 5.7+)

---

## Architecture

```text
Browser
  React SPA (Vite dev server, :5173)
  ├─ AuthContext          session state
  ├─ components/          UI
  └─ api/api.js           all HTTP calls go through here
        │
        │  JSON over HTTP
        ▼
Flask API (:5000)
  ├─ routes/     Blueprints — HTTP concerns only
  ├─ services/   business logic
  ├─ models/     data shapes
  └─ utils/db    parameterized SQL
        │
        ▼
MySQL  ·  users · posts · follows
```

Requests flow **routes → services → database**. Routes never touch SQL and services
never touch the request object, which keeps each layer testable on its own.

---

## Requirements

Install these yourself — the setup script checks for them but will not install
system software on your behalf.

| Software | Version | Needed for | Check |
|---|---|---|---|
| [Node.js](https://nodejs.org) | 18+ | frontend + the setup scripts | `node --version` |
| [Python](https://python.org) | 3.9+ | backend | `python --version` |
| [MySQL](https://dev.mysql.com/downloads/) | 5.7+ | database | `mysql --version` |

On Windows, tick **"Add python.exe to PATH"** in the Python installer.

Verify everything at once:

```bash
npm run doctor
```

If MySQL is missing you can still use the Docker path above.

---

## Environment setup

`npm run setup` creates both `.env` files from their `.env.example` templates.
Existing files are never overwritten.

### `backend/.env`

| Variable | Required | Default | What it does |
|---|---|---|---|
| `FLASK_ENV` | no | `development` | `development` \| `testing` \| `production` |
| `FLASK_DEBUG` | no | `False` | Auto-reload and the debugger. **Never `True` on a server** — the Werkzeug debugger allows remote code execution |
| `HOST` | no | `127.0.0.1` | Interface to bind. Use `0.0.0.0` only behind nginx |
| `PORT` | no | `5000` | API port |
| `DB_HOST` | **yes** | `localhost` | MySQL host |
| `DB_USER` | **yes** | `root` | MySQL user |
| `DB_PASSWORD` | **yes** | — | Your own local MySQL password. Leave empty if your MySQL has none |
| `DB_NAME` | **yes** | `social_app` | Database name — must match `db/schema.sql` |
| `CORS_ORIGINS` | **yes** | `http://localhost:5173` | Comma-separated origins allowed to call the API. Add your deployed frontend origin in production |
| `SECRET_KEY` | **yes** | — | Signs session cookies. Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |

### `frontend/.env`

| Variable | Required | Default | What it does |
|---|---|---|---|
| `VITE_API_BASE_URL` | **yes** | `http://localhost:5000/api` | Where the frontend sends API calls. Change this when deploying |

> `.env` files are gitignored. Never commit real credentials — put placeholders in
> `.env.example` instead.

---

## Database setup

`npm run setup` does this automatically. To do it manually:

```bash
mysql -u root -p < db/schema.sql
mysql -u root -p < db/seed.sql     # optional demo data
```

| File | Contents |
|---|---|
| `db/schema.sql` | Database, tables, foreign keys, indexes. Re-runnable |
| `db/seed.sql` | Demo users, posts and follows. Re-runnable |

### Schema

```text
users                          posts                        follows
─────                          ─────                        ───────
id            PK  ◄──────┐     id            PK       ┌───► follower_id   PK,FK
email         UNIQUE     └──── user_id       FK       ├───► following_id  PK,FK
password      (bcrypt)         title                  │     created_at
name                           body    (sanitized HTML)│
bio                            image_url              │
profile_picture                created_at             │
created_at  ◄──────────────────────────────────────────┘
```

All foreign keys use `ON DELETE CASCADE`, so removing a user removes their posts
and follow relationships rather than leaving orphaned rows.

---

## Available scripts

Run from the project root.

| Command | What it does |
|---|---|
| `npm start` | Setup, then run both servers. **The one command** |
| `npm run setup` | Prerequisites, dependencies, `.env` files, database. Idempotent — a repeat run takes about a second because it skips work that is already done |
| `npm run setup -- --reinstall` | Force a clean `npm ci`, e.g. after a broken install |
| `npm run dev` | Run backend + frontend together (assumes setup is done) |
| `npm run doctor` | Check prerequisites only. Changes nothing |
| `npm test` | Run both test suites |
| `npm run build` | Production build of the frontend into `frontend/dist` |
| `npm run db:doctor` | Diagnose a MySQL connection problem. Reads nothing secret, writes nothing |
| `npm run db:init` | Apply schema + seed only |
| `npm run db:reset` | **Drop** the database and rebuild it from scratch |

Frontend-only (run inside `frontend/`):

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run test` | Vitest, once |
| `npm run test:watch` | Vitest, watch mode |
| `npm run test:coverage` | Vitest with a coverage report |
| `npm run test:e2e` | Cypress end-to-end tests |
| `npm run lint` | ESLint |

---

## Project structure

```text
my-app/
├── package.json            root scripts — the entry point
├── docker-compose.yml      full environment in containers
│
├── db/
│   ├── schema.sql          tables, keys, indexes
│   └── seed.sql            demo data
│
├── scripts/
│   ├── setup.mjs           prerequisites, install, configure, database
│   ├── dev.mjs             runs both servers with one Ctrl+C
│   ├── test.mjs            runs both test suites
│   ├── run-backend.mjs     runs a command inside the backend venv
│   └── lib/env.mjs         shared helpers (no npm dependencies)
│
├── backend/
│   ├── run.py              entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   └── app/
│       ├── __init__.py     app factory, CORS, error handlers
│       ├── config/         environment-based configuration
│       ├── models/         data shapes
│       ├── routes/         Blueprints: auth, posts, users, follows
│       ├── services/       business logic
│       └── utils/db.py     database access
│
└── frontend/
    ├── package.json
    ├── vite.config.js      build config
    ├── vitest.config.js    test config
    ├── Dockerfile
    ├── cypress/            end-to-end tests
    └── src/
        ├── api/api.js      every HTTP call
        ├── auth/           AuthContext + ProtectedRoute
        ├── components/     UI components
        └── tests/          unit tests
```

---

## API

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Service check |
| `POST` | `/auth/signup` | Create an account |
| `POST` | `/auth/login` | Sign in |
| `GET` | `/posts/` | Feed. `?start&limit&userId&followingOnly&currentUserId` |
| `POST` | `/posts/` | Create a post |
| `GET` | `/users/` | List/search users. `?start&limit&search` |
| `GET` | `/users/<id>` | One user |
| `GET` | `/users/<id>/follow-stats` | Follower, following and post counts |
| `POST` | `/follows/` | Follow a user |
| `DELETE` | `/follows/` | Unfollow a user |
| `GET` | `/follows/check` | Is A following B |
| `GET` | `/follows/<id>/followers` | Who follows this user |
| `GET` | `/follows/<id>/following` | Who this user follows |

---

## Troubleshooting

**`npm start` says Python is not found (Windows)**
Python was installed without being added to PATH. Re-run the installer, choose
*Modify*, and enable *Add python.exe to PATH*. Then open a new terminal.

**`cannot connect to MySQL`**
The server isn't running, or `DB_PASSWORD` in `backend/.env` is wrong. Test your
credentials directly with `mysql -u root -p`. Or skip MySQL entirely with `docker compose up`.

**`could not create the virtualenv` (Linux)**
`sudo apt install python3-venv`

**Port 5000 or 5173 already in use**

```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# macOS / Linux
lsof -ti:5000 | xargs kill -9
```

Or change `PORT` in `backend/.env`.

**Frontend loads but shows no posts**
The API isn't reachable. Check `http://localhost:5000/api/health` in your browser,
confirm `VITE_API_BASE_URL` in `frontend/.env`, and look for CORS errors in the
browser console — the frontend's origin must appear in `CORS_ORIGINS`.

**The database is in a bad state**

```bash
npm run db:reset
```

This drops and rebuilds it. All data is lost.
