"""
Production WSGI settings.

The Flask development server is single-threaded per request, has no process
supervision and prints a warning telling you not to use it in production. It is
also the thing that reloads on file changes, which is not something a server
should do. gunicorn replaces it.

    gunicorn -c gunicorn.conf.py run:app
"""
import multiprocessing
import os

# Only nginx talks to this, and nginx is on the same host. Binding to 0.0.0.0
# would expose the API directly, bypassing the proxy — and with it the TLS
# termination and the rate limits.
bind = os.getenv('GUNICORN_BIND', '127.0.0.1:5000')

# The usual starting point. A t2.micro has one core, which gives 3 workers.
workers = int(os.getenv('GUNICORN_WORKERS', (multiprocessing.cpu_count() * 2) + 1))

# Threads matter here more than usual: every request spends most of its time
# waiting on MySQL, and app/utils/db.py hands each one its own pooled
# connection. POOL_SIZE is 10, so keep workers × threads at or under that or
# requests will queue on the pool instead of on the database.
threads = int(os.getenv('GUNICORN_THREADS', 2))
worker_class = 'gthread'

# Long enough for an image upload on a slow connection, short enough that a
# stuck worker is recycled rather than holding a slot forever.
timeout = 60
graceful_timeout = 30

# nginx holds client connections open; this must exceed nginx's own
# keepalive_timeout or the proxy will occasionally reuse a socket the worker
# has just closed, which surfaces as a random 502.
keepalive = 65

# Recycle workers periodically. It costs nothing and it makes a slow leak in a
# dependency a non-event rather than an outage at 3am.
max_requests = 1000
max_requests_jitter = 100

accesslog = '-'
errorlog = '-'
loglevel = os.getenv('GUNICORN_LOGLEVEL', 'info')

# The real client address, not nginx's 127.0.0.1. ProxyFix in app/__init__.py
# does the same for the application; this is for gunicorn's own access log.
forwarded_allow_ips = '127.0.0.1'
access_log_format = '%({X-Forwarded-For}i)s %(m)s %(U)s %(s)s %(L)ss'

# NOT set: preload_app. It would run create_app() once in the master and fork,
# which is faster to start — but the MySQL connection pool would then be created
# before the fork and shared between workers, and a socket shared across
# processes is exactly the "Commands out of sync" bug this project already had
# once. Each worker builds its own pool.
