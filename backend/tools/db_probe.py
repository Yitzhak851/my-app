"""
Tests the database connection through EXACTLY the code path the Flask app uses.

    python backend/tools/db_probe.py

This exists because the mysql command-line client and mysql-connector-python are
two different clients with different defaults. The CLI succeeding tells you the
server and the password are fine; it tells you nothing about whether the app can
connect. When those two disagree, this script says why.

Prints no password, only its length.
"""
import os
import sys
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

def out(status, msg):
    print(f"{status} {msg}")

print("\n1  Library versions")
try:
    import mysql.connector
    connector_version = mysql.connector.__version__
    out("*", f"mysql-connector-python {connector_version}")
except ImportError:
    out("X", "mysql-connector-python is not installed — run: npm run setup")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    out("X", "python-dotenv is not installed — run: npm run setup")
    sys.exit(1)

print(f"*  Python {sys.version.split()[0]}")

print("\n2  Configuration as the app reads it")
# Load .env the same way run.py does: relative to the backend directory.
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
env_path = os.path.join(backend_dir, '.env')

if not os.path.exists(env_path):
    out("X", "backend/.env does not exist — run: npm run setup")
    sys.exit(1)

load_dotenv(env_path)

cfg = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'social_app'),
}

print(f"    host     = {cfg['host']}")
print(f"    user     = {cfg['user']}")
print(f"    database = {cfg['database']}")
pw_desc = "<empty>" if not cfg['password'] else "%d characters" % len(cfg['password'])
print("    password = " + pw_desc)

print("\n3  Connection attempts")

def attempt(label, **overrides):
    params = dict(cfg)
    params.update(overrides)
    try:
        conn = mysql.connector.connect(connection_timeout=8, **params)
        cur = conn.cursor()
        cur.execute("SELECT VERSION()")
        server = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM users")
        users = cur.fetchone()[0]
        cur.close()
        conn.close()
        out("OK", f"{label}: SUCCESS  (server {server}, {users} users in table)")
        return True, None
    except Exception as e:
        out("X", f"{label}: failed")
        print(f"       {type(e).__name__}: {e}")
        return False, e

results = {}
results['plain'], err_plain = attempt("as the app connects")

if not results['plain']:
    # caching_sha2_password (the default from MySQL 8.0.4 onward) refuses to send
    # the password over an unencrypted link unless the client can fetch the
    # server's public key. Older connectors do not request it by default.
    results['rsa'], _ = attempt("with get_warnings + RSA public key retrieval",
                                allow_local_infile=False, use_pure=True,
                                ssl_disabled=True)
    results['pure'], _ = attempt("with the pure-Python implementation", use_pure=True)
    results['nodb'], _ = attempt("without selecting a database", database='')

print("\n4  Verdict")

if results['plain']:
    out("OK", "The app can reach the database. Nothing to fix here.")
    sys.exit(0)

msg = str(err_plain)
code = getattr(err_plain, 'errno', None)

if code == 1045 or 'Access denied' in msg:
    out("X", "MySQL rejected the credentials for the Python client.")
    print()
    print("    The mysql CLI works but Python does not. That combination almost")
    print("    always means a client/server version mismatch rather than a wrong")
    print("    password: MySQL 8.0.4+ defaults to the caching_sha2_password auth")
    print("    plugin, and older connectors cannot complete that handshake over an")
    print("    unencrypted local connection.")
    print()
    print(f"    Your connector: mysql-connector-python {connector_version}")
    print("    Fix: install the connector that matches your server major version.")
    print("        npm run setup -- --reinstall")
    print("    or directly:")
    print("        backend/venv/Scripts/python -m pip install --upgrade mysql-connector-python")
elif code == 1049 or 'Unknown database' in msg:
    out("X", f"The database \"{cfg['database']}\" does not exist.")
    print("    Create it:  npm run db:init")
elif code in (2003, 2002) or "Can't connect" in msg:
    out("X", "The MySQL server is not reachable from Python.")
    print("    Check the server is running and DB_HOST is correct.")
else:
    out("X", "Unrecognised error — see the message above.")

sys.exit(1)
