# Final audit

Every requirement from the course brief, what satisfies it, and where to look.
Written from the running application, not from memory: each claim below points
at a file, and everything marked ✅ was exercised in the 35-check browser
walkthrough (`npm run verify`) against the production stack — nginx, gunicorn,
MySQL, HTTPS — not against the development servers.

**Numbers**

| | |
|---|---|
| Tests | 568 (337 backend, 231 frontend), all passing |
| Statement coverage | backend 93.8%, frontend 93.6% (requirement: 85%) |
| Browser walkthrough | 35 / 35 |
| Optional requirements | 3 of 6, as the brief asks |

---

## 1. Basic requirements

| # | Requirement | Status | Where |
|---|---|---|---|
| 1.a.i | Sign-up, login, logout | ✅ | `backend/app/routes/auth_routes.py`, `frontend/src/components/{Login,Signup}.jsx` |
| 1.a.ii | Secure password storage / hashing | ✅ | `auth_service.py` — bcrypt with a per-user salt. `test_auth.py` asserts the stored value starts `$2b$` and that no endpoint ever returns it |
| 1.b | Profile page: name, bio, picture, that user's posts | ✅ | `UserProfile.jsx`, `GET /api/users/<id>` |
| 1.c.i | Search users by username | ✅ | `Search.jsx`, `Users.jsx`, `UsersService.fetch_users`. Matching on email was removed — it turned the search box into an address-harvesting tool |
| 1.c.ii | Follow / unfollow, counts on the profile | ✅ | `follow_routes.py`, `GET /api/users/<id>/follow-stats` |
| 1.c.iii | "time ago", not a raw date | ✅ | `components/timeAgo.js`, used by posts and comments alike |
| 1.d.i | Global feed | ✅ | `Feed.jsx`, `GET /api/posts/` |
| 1.d.ii | Feed of people you follow | ✅ | `?followingOnly=true`. The viewer comes from the session — a `currentUserId` in the query used to let anyone read someone else's personal feed |
| 1.d.iii | Lazy loading / infinite scroll | ✅ | `Feed.jsx:75` scroll handler, `start`/`limit` paging |
| 1.e | Create a post: text **and image** | ✅ | Real file upload, not a URL field: `upload_routes.py`, `upload_service.py`. Magic-byte validation, UUID filenames, SVG refused (an SVG can carry script) |
| 1.e.i | WYSIWYG editor | ✅ | Quill, `NewPost.jsx:56`. Output sanitised with DOMPurify before rendering |
| 1.f | Database diagram | ✅ | `db/erd.svg` (also `.mmd` source and `.html`). 8 tables: users, posts, comments, likes, follows, sessions, reports, password_resets |

## 2. Core requirements

| # | Requirement | Status | Where |
|---|---|---|---|
| 2.a.i | Secure password reset by email | ✅ | `password_reset_service.py`. Tokens are stored as SHA-256 hashes, expire in 30 minutes, are single-use, and every session is destroyed on success. The response is identical for a registered and an unregistered address, so the form cannot be used to find out who has an account |
| 2.b.i | Likes | ✅ | `likes_service.py`, `PostInteractions.jsx` — optimistic, rolled back on failure, count from the server |
| 2.b.ii | Comments | ✅ | `comments_service.py`. Flat with a `parent_id` column, rendered as text — never as HTML |
| 2.c | Auto-correct, generated posts, contextual comment suggestions | ✅ | `services/ai/provider.py` + `ai_routes.py`. All three are suggestions the writer can ignore; none rewrites anything on its own |
| 2.d.i | ≥10 autonomous agents, acting continuously | ✅ | 10 accounts, `agent_service.py`, driven by `run_agents.py` on a timer. They post, comment on each other and on people, and like |
| 2.d.ii | A defined personality per agent, stored and used | ✅ | `services/ai/personalities.py`; `users.personality` in the schema; 10 distinct values in the database. The personality selects the openers and replies each agent uses |
| 2.e.i | Moderators | ✅ | `users.role` (user / moderator / admin), `@moderator_required`, `@admin_required` |
| 2.e.ii | Report flow + admin dashboard: delete content, ban users | ✅ | `ReportButton.jsx`, `AdminDashboard.jsx` (Reports / Auto-flagged / Users), `moderation_service.py`. A ban destroys that user's sessions immediately rather than waiting for them to expire |
| 2.e.iii | Sentiment analysis — flag toxic content **before** publishing | ✅ | `services/ai/sentiment.py`, scored on create for both posts and comments. Flagged content is published and queued for review, not silently dropped |
| 2.f | 85% code coverage | ✅ | 93.8% / 93.6%. Enforced, not just reported: `--cov-fail-under=85` and vitest thresholds fail the run |

## 3. Optional requirements — 3 of 6

| # | Requirement | Status | Where |
|---|---|---|---|
| 3.b | Responsive: usable on desktop and phone | ✅ | Verified at 390px on seven pages. The navigation bar used to lay out in one non-wrapping row — signed in as an admin it measured 663px inside a 390px viewport, so the page scrolled sideways and Logout sat off-screen |
| 3.e.i | "Suggested users" from mutual follows | ✅ | `suggestions_service.py`, `SuggestedUsers.jsx`. People followed by the people you follow, ranked by how many — and the count is shown as the reason. Falls back to popular accounts for someone who follows nobody yet |
| 3.f | Dockerfile + docker-compose, one command | ✅ | `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` — `docker compose up` brings up MySQL, the API and the frontend |

Not chosen: 3.a (OAuth / 2FA), 3.c (direct messaging), 3.d (video).

---

## Deployment

Everything needed to deploy is in `deploy/`, and the stack it describes was
built and exercised end to end before the guide was written: nginx serving the
built app, `/api` proxied to gunicorn with three workers, the agent simulation
as its own process, MySQL, HTTPS with `Secure` session cookies. The 35-check
walkthrough was run against that, over HTTPS.

**What is left to you:** launching the EC2 instance and running
`sudo bash deploy/deploy.sh` on it. `deploy/README.md` is the step-by-step —
instance, security group, database, deploy, certbot — with a table of the
failures that actually happen and the cause of each.

One thing to know before you start: **HTTPS is not optional here.**
`SESSION_COOKIE_SECURE=True` means the browser silently discards the session
cookie over plain HTTP. The API log shows nothing but `200`s and every page
says you are signed out. Run certbot before showing anyone the site.

---

## What was wrong, and what fixed it

The work was not evenly distributed. Some of these were in the original code,
some were introduced during the rewrite and caught by the tests written for it,
and three were found only by driving a real browser.

**Found by driving a real browser, invisible to every other check**

| | |
|---|---|
| **The Dismiss button in the moderation dashboard did nothing.** | `PATCH` was missing from the CORS allow-list (and `PUT`, which no route uses, was in it). The browser refused to send the request. Server healthy, endpoint fine from curl, unit tests green, nothing in any log. `backend/tests/test_cors.py` now reads the verbs from the app's own URL map, so the next verb added is covered without anyone remembering |
| **The navigation bar overflowed on a phone.** | 663px of content in a 390px viewport when signed in as an admin — requirement 3.b was broken in exactly the state nobody had checked |
| **`login` omitted `role`.** | A moderator who had just signed in saw no Moderation link until they happened to refresh. Three curl tests passed; only the browser showed it. Fixed with one projection — `AuthService.public_self()` — used by login, signup and `/auth/me` |

**Found by writing the tests**

| | |
|---|---|
| Four endpoints answered a database outage with `str(exception)` — a MySQL error quotes the failing statement, and the statement names the tables and columns | `app/utils/errors.py`: the real cause goes to the log, the caller gets a sentence |
| Two `failure()` calls were mislabelled, so an error in `fetch_posts` logged as `create_post` | A test now reads the source and checks every label against the function it sits in |
| The search box in the moderation Users tab swallowed everything after the first keystroke — it was inside the `!loading` branch, so it unmounted mid-typing | Moved out, and debounced |
| The feed swallowed load failures into `console.error`: with the backend down the page was blank, with no explanation and no retry | An error with a Retry button |
| A follow-state check still in flight could overwrite a click that came after it — the server had recorded the follow, the screen said it had not | A generation counter; pressing the button retires any check in flight |
| A failed Follow click replaced the whole profile with a "Try again" screen — one `error` state was doing two jobs | Split into a fatal error and an action error |
| `?limit=1000000` on the user directory returned the entire table in one request | Capped at 100 |
| Uploaded images were stored as absolute URLs, so every image uploaded in development would break the moment the app moved to a server | Root-relative paths, with a Vite dev proxy so they resolve in both places |
| The personal feed said "אין עדיין פוסטים להצגה" when it was empty — one click after seeing ten posts on the global feed, that reads as a broken page rather than "you do not follow anybody yet" | An empty state that names the reason and offers a way out |
| Switching feed filter while the first page was still loading was silently dropped: `if (loading) return` guarded the filter change as well as the scroll path, so the posts were cleared, nothing was fetched, and the earlier request then hid the spinner — a blank page with no posts, no spinner and no error | The filter change supersedes what is in flight; a stale reply is discarded rather than applied |
| `?limit=1000000` on the feed returned every post with its author joined on, in one request — the user directory had been capped, the feed had not | Capped at 100, like the directory |
| The agent scheduler could stop firing while the process stayed healthy — suspending the machine is enough. Nothing crashes, nothing is logged, systemd sees a running service, and requirement 2.d quietly stops being true | A misfire grace so a missed tick resumes, and a watchdog that exits when no tick has happened, so systemd restarts a working one |

**Found in the original code, earlier in the project**

| | |
|---|---|
| Every endpoint trusted a user id sent in the request body — anyone could post, follow or read a personal feed as anyone else | Server-side sessions; the client no longer gets a vote |
| `2014 (HY000): Commands out of sync` under any concurrency | One shared MySQL connection replaced with a pool. The old version failed 528 of 540 concurrent operations; the new one, 0 |
| Creating a post failed with an opaque "Failed to fetch" while reading worked | A CORS preflight followed by a 308 redirect — the fetch spec forbids following a redirect after a preflight. `strict_slashes = False` |
| Every profile page rendered "Failed to load user profile" | The API returns the user at the top level; the component read `data.user` |
| Email addresses were published on the feed, the user list and search | Explicit public projections; a test now asserts no response contains an address |

---

## Honest assessment

**Where this is strong.** The requirements are met and the evidence is
reproducible — `npm test` and `npm run verify` both run from one command and
tell you the truth. Coverage is enforced rather than reported. The security
work is real: sessions on the server, bcrypt, parameterised SQL everywhere,
magic-byte upload validation, no addresses in public responses, no exception
text in any error. The deployment is a working stack that was tested before it
was documented, not a set of instructions someone hopes will work.

**Where it is weaker.**

- **The AI layer is template-driven, not a model.** `LocalProvider` needs no key,
  no network and no budget, which is why it is the default — but its output is
  limited and its sentiment scoring is a lexicon, so it will miss sarcasm and
  anything it has no word for. The interface is the part that is properly
  built: adding a hosted model is one subclass and one line of `.env`.
- **Comments are flat.** The brief allows "nested or flat"; there is a
  `parent_id` column and the API accepts it, but the UI renders one level.
- **Coverage is not evenly spread.** 93% overall hides `PostInteractions.jsx`
  and `UserProfile.jsx` at closer to 80%, which are two of the busiest
  components.
- **One instance, no redundancy.** MySQL, the API and nginx all on one box. That
  is the right size for this project and would not survive real traffic or an
  instance failure.
- **The agents are convincing for a minute, not for an hour.** Their content
  comes from per-personality template pools, so watching one long enough shows
  the repetition.

**Not done, deliberately.** OAuth and 2FA, direct messaging and video: the brief
asks for three of six optional requirements and three are done. Adding a fourth
badly would be worth less than three done properly.

---

## Housekeeping

Four files in the repository root — `FINAL_DELIVERY.txt`,
`IMPLEMENTATION_REPORT.md`, `PROJECT_SUMMARY.md`, `QUICK_START.md` — predate
this work, are dated June 2026, and describe the project as complete in terms
that no longer match it. Anyone reading them will get the wrong picture, and a
grader might read them first. `README.md` and this file are the current
documentation; the four should be deleted.
