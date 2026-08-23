import os
import sys

from dotenv import load_dotenv

from app import create_app

# Load environment variables
load_dotenv()


def check_production_config(application):
    """
    Refuse to start a production process that is quietly insecure.

    Both of these are silent failures — nothing in the log, nothing in the
    browser — which is exactly why they are worth failing loudly on:

      * a default SECRET_KEY means anyone who has read this repository can
        forge whatever the key signs;
      * DEBUG on in production is the Werkzeug interactive debugger, which is
        remote code execution for anyone who can reach the port.

    Only checked when FLASK_ENV=production, so nothing changes for development.
    """
    if os.getenv('FLASK_ENV', 'development').strip().lower() != 'production':
        return

    problems = []

    secret = application.config.get('SECRET_KEY', '')
    if not secret or secret in ('dev-key', 'change-me-generate-a-random-value'):
        problems.append(
            'SECRET_KEY is still the placeholder. Generate one with:\n'
            '        python -c "import secrets; print(secrets.token_hex(32))"'
        )

    # Read the environment variable, not application.config['DEBUG'].
    # ProductionConfig hardcodes DEBUG = False, so the config always looks
    # innocent — while the __main__ block below passes os.getenv('FLASK_DEBUG')
    # straight to app.run(). Checking the config would have made this guard
    # agree that everything was fine and start the debugger anyway.
    if os.getenv('FLASK_DEBUG', 'False').strip().lower() in ('1', 'true', 'yes'):
        problems.append('FLASK_DEBUG is on. The Werkzeug debugger allows remote code execution.')

    if not application.config.get('DB_PASSWORD'):
        problems.append('DB_PASSWORD is empty. A database with no password is reachable by anyone on the host.')

    if problems:
        print('\nRefusing to start in production:\n', file=sys.stderr)
        for problem in problems:
            print(f'  - {problem}', file=sys.stderr)
        print('\nFix these in backend/.env and start again.\n', file=sys.stderr)
        sys.exit(1)

    if not application.config.get('SESSION_COOKIE_SECURE'):
        # Not fatal — someone may deliberately be testing over plain HTTP — but
        # it must not pass unnoticed.
        print('WARNING: SESSION_COOKIE_SECURE is off. The session cookie will '
              'travel in the clear.', file=sys.stderr, flush=True)


# Created at import time so a WSGI server (gunicorn run:app) gets the same
# object, and the same checks, as `python run.py`.
app = create_app()
check_production_config(app)


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))

    # debug must never be hardcoded on: Werkzeug's interactive debugger allows arbitrary
    # code execution for anyone who can reach the port. Both values come from .env and
    # default to the safe option, so an unconfigured production box is not exposed.
    debug = os.getenv('FLASK_DEBUG', 'False').strip().lower() in ('1', 'true', 'yes')
    host = os.getenv('HOST', '127.0.0.1')

    app.run(host=host, port=port, debug=debug)
