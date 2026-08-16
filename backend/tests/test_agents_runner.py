"""
The scheduler that drives the agents (requirement 2.d: "on an ongoing,
continuous basis").

Everything interesting about this module is a thing that only shows up at
runtime and never in a unit of business logic: whether it starts at all, how
many times it starts, and whether the job it schedules can actually run outside
a request. All three have gone wrong before.
"""
import pytest

from app import agents_runner


class FakeScheduler:
    """Records what would have been scheduled, without starting a thread."""

    created = []

    def __init__(self, daemon=False):
        self.daemon = daemon
        self.jobs = []
        self.started = False
        FakeScheduler.created.append(self)

    def add_job(self, func, trigger, **kwargs):
        self.jobs.append({'func': func, 'trigger': trigger, **kwargs})

    def start(self):
        self.started = True

    def run_all(self):
        for job in self.jobs:
            job['func']()


@pytest.fixture
def runner(app, monkeypatch):
    """A clean module state and a scheduler that does not spawn threads."""
    FakeScheduler.created.clear()
    monkeypatch.setattr(agents_runner, '_scheduler', None)
    monkeypatch.setattr(agents_runner, 'BackgroundScheduler', FakeScheduler)
    monkeypatch.delenv('WERKZEUG_RUN_MAIN', raising=False)
    app.config['AGENTS_ENABLED'] = True
    app.debug = False
    return app


# ──────────────────────────────────────────────────── when it must not run ───

def test_the_loop_stays_off_when_agents_are_disabled(runner):
    runner.config['AGENTS_ENABLED'] = False

    assert agents_runner.start(runner) is None
    assert FakeScheduler.created == []


def test_the_testing_config_disables_the_agents(app):
    """
    A background job writing to the database during a test run would make the
    whole suite depend on timing.
    """
    assert app.config['AGENTS_ENABLED'] is False


def test_the_reloader_parent_process_does_not_start_the_loop(runner, monkeypatch):
    """
    In debug mode Flask runs the app twice — a supervising parent and the child
    that serves requests. Without this guard both start a scheduler and the
    agents move at double the configured speed.
    """
    runner.debug = True
    monkeypatch.delenv('WERKZEUG_RUN_MAIN', raising=False)

    assert agents_runner.start(runner) is None
    assert FakeScheduler.created == []


def test_the_reloader_child_process_does_start_the_loop(runner, monkeypatch):
    runner.debug = True
    monkeypatch.setenv('WERKZEUG_RUN_MAIN', 'true')

    assert agents_runner.start(runner) is not None
    assert len(FakeScheduler.created) == 1


def test_calling_start_twice_reuses_the_same_scheduler(runner):
    first = agents_runner.start(runner)
    second = agents_runner.start(runner)

    assert first is second
    assert len(FakeScheduler.created) == 1, 'a second scheduler would double the tick rate'


# ─────────────────────────────────────────────────────── how it schedules ────

def test_the_job_is_scheduled_at_the_configured_interval(runner):
    runner.config['AGENT_TICK_SECONDS'] = 7

    scheduler = agents_runner.start(runner)

    job = scheduler.jobs[0]
    assert job['trigger'] == 'interval'
    assert job['seconds'] == 7
    assert scheduler.started is True


def test_a_slow_tick_does_not_queue_a_burst_of_missed_ones(runner):
    scheduler = agents_runner.start(runner)

    job = scheduler.jobs[0]
    assert job['max_instances'] == 1
    assert job['coalesce'] is True


def test_the_scheduler_thread_does_not_keep_the_process_alive(runner):
    """A non-daemon thread means Ctrl-C leaves the server hanging."""
    assert agents_runner.start(runner).daemon is True


# ──────────────────────────────────────────────────────────── the tick ───────

def test_a_tick_runs_with_an_application_context(runner, db, capsys, monkeypatch):
    """
    A scheduled job has no request, so it has no app context either. Every
    lookup inside the services — config, the database — fails without one.
    """
    from flask import current_app

    from app.services.agent_service import AgentService

    seen = {}

    def fake_tick(rng=None):
        seen['app_name'] = current_app.name
        return 'Night Owl liked a post'

    monkeypatch.setattr(AgentService, 'tick', staticmethod(fake_tick))

    agents_runner.start(runner).run_all()

    assert seen['app_name'] == runner.name
    assert '[agents] Night Owl liked a post' in capsys.readouterr().out


def test_a_tick_that_did_nothing_prints_nothing(runner, db, capsys, monkeypatch):
    """The log is meant to be readable; a line per idle tick makes it noise."""
    from app.services.agent_service import AgentService

    monkeypatch.setattr(AgentService, 'tick', staticmethod(lambda rng=None: None))

    scheduler = agents_runner.start(runner)
    capsys.readouterr()          # discard the startup banner
    scheduler.run_all()

    assert capsys.readouterr().out == ''
