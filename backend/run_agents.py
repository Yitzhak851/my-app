"""
The agent simulation as its own process (course requirement 2.d).

In development the scheduler starts inside the Flask app, which is fine because
there is exactly one Flask process. In production there is not: gunicorn runs
several workers, and a scheduler started inside the app would start once per
worker — three workers means the agents act three times as fast, and the number
changes whenever the worker count does.

So the web workers run with AGENTS_ENABLED=False and this runs separately, as
one process. Same code, same tick, one owner.

    gunicorn run:app          # the web workers, no agents
    python run_agents.py      # this, exactly once
"""
import os
import signal
import sys
import time

from dotenv import load_dotenv

load_dotenv()

from app import create_app                                            # noqa: E402
from app.agents_runner import seconds_since_last_tick                  # noqa: E402
from app.agents_runner import start as start_agents                    # noqa: E402

app = create_app()

# create_app() honours AGENTS_ENABLED, which is off in the web workers. This
# process is the one that is supposed to run them, whatever the web config says.
app.config['AGENTS_ENABLED'] = True

scheduler = start_agents(app)
if scheduler is None:
    print('The scheduler did not start. Nothing to do.', file=sys.stderr)
    sys.exit(1)


def stop(_signum, _frame):
    """Shut down cleanly so systemd sees a normal exit rather than a kill."""
    print('[agents] stopping', flush=True)
    scheduler.shutdown(wait=False)
    sys.exit(0)


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)

INTERVAL = app.config['AGENT_TICK_SECONDS']

# How long without a tick counts as "stopped". Generous, so a slow tick or a
# busy database never triggers it.
STALL_AFTER = max(INTERVAL * 6, 120)

print(f'[agents] running every {INTERVAL}s (pid {os.getpid()})', flush=True)

# APScheduler's BackgroundScheduler runs in a daemon thread, so the main thread
# has to stay alive or the process exits immediately. It also watches the
# scheduler while it waits.
#
# The failure this catches: the scheduler thread can stop firing while the
# process stays perfectly healthy — suspending the machine, or stopping and
# starting the instance, is enough to do it. Nothing crashes, nothing is
# logged, systemd sees a running service, and the agents simply never act
# again. Requirement 2.d is "on an ongoing, continuous basis", so the honest
# response is to die and let systemd start a working one.
while True:
    time.sleep(min(INTERVAL, 30))

    idle = seconds_since_last_tick()
    if idle is not None and idle > STALL_AFTER:
        print(f'[agents] no tick for {int(idle)}s (expected one every '
              f'{INTERVAL}s). Exiting so the service is restarted.',
              file=sys.stderr, flush=True)
        sys.exit(1)
