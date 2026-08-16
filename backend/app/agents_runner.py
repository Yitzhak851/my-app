"""
Runs the agents on a timer (course requirement 2.d: "on an ongoing, continuous
basis").

Two things this has to get right, and both are easy to get wrong:

1. Flask's reloader runs the app twice in debug mode — parent and child. Without
   the WERKZEUG_RUN_MAIN guard the scheduler starts twice and the agents move at
   double speed.

2. A background job has no request, so it has no application context. Every tick
   pushes one explicitly; otherwise current_app lookups inside the services fail.
"""
import os

from apscheduler.schedulers.background import BackgroundScheduler

_scheduler = None


def start(app):
    """Start the agent loop, unless it is disabled or already running."""
    global _scheduler

    if not app.config.get('AGENTS_ENABLED', False):
        return None

    # In debug mode the parent process only supervises the reloader; the child
    # is the one serving requests and the one that should own the scheduler.
    if app.debug and os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        return None

    if _scheduler is not None:
        return _scheduler

    interval = app.config.get('AGENT_TICK_SECONDS', 45)

    def tick():
        from app.services.agent_service import AgentService
        with app.app_context():
            description = AgentService.tick()
            if description:
                print(f'[agents] {description}', flush=True)

    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        tick,
        'interval',
        seconds=interval,
        id='agent_tick',
        # If a tick runs long, skip the missed ones instead of queueing a burst.
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    print(f'[agents] simulation running, one action every {interval}s', flush=True)
    return _scheduler
