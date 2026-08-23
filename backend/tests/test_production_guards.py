"""
The checks that refuse to start an insecure production process.

Each of these is a silent failure. Nothing in the log, nothing on the screen,
and the app appears to work perfectly — which is what makes them worth failing
loudly on rather than documenting and hoping.

Only active when FLASK_ENV=production, so none of it changes development.
"""
import pytest

from run import check_production_config


class FakeApp:
    def __init__(self, **config):
        self.config = {
            'SECRET_KEY': 'a-real-random-value',
            'DB_PASSWORD': 'a-real-password',
            'SESSION_COOKIE_SECURE': True,
            'DEBUG': False,
        }
        self.config.update(config)


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'production')
    monkeypatch.setenv('FLASK_DEBUG', 'False')


def test_a_properly_configured_production_app_starts(production):
    check_production_config(FakeApp())          # must not raise


def test_development_is_never_blocked(monkeypatch, capsys):
    """The whole point of the defaults is that they are fine for development."""
    monkeypatch.setenv('FLASK_ENV', 'development')
    monkeypatch.setenv('FLASK_DEBUG', 'True')

    check_production_config(FakeApp(SECRET_KEY='dev-key', DB_PASSWORD='',
                                    SESSION_COOKIE_SECURE=False, DEBUG=True))

    assert capsys.readouterr().err == ''


@pytest.mark.parametrize('secret', ['', 'dev-key', 'change-me-generate-a-random-value'])
def test_a_placeholder_secret_key_stops_the_process(production, secret):
    """
    Anyone who has read this repository knows the development key. Signing
    anything with it in production means anyone can forge it.
    """
    with pytest.raises(SystemExit) as exit_code:
        check_production_config(FakeApp(SECRET_KEY=secret))

    assert exit_code.value.code == 1


def test_an_empty_database_password_stops_the_process(production):
    with pytest.raises(SystemExit):
        check_production_config(FakeApp(DB_PASSWORD=''))


def test_debug_mode_stops_the_process(production, monkeypatch):
    """FLASK_DEBUG in production is remote code execution for anyone who can reach the port."""
    monkeypatch.setenv('FLASK_DEBUG', 'True')

    with pytest.raises(SystemExit):
        check_production_config(FakeApp())


def test_the_debug_check_reads_the_environment_not_the_config(production, monkeypatch):
    """
    ProductionConfig hardcodes DEBUG = False, so app.config always looks
    innocent — while run.py's __main__ block passes os.getenv('FLASK_DEBUG')
    straight to app.run(). A guard that trusted the config would agree
    everything was fine and start the debugger anyway.
    """
    monkeypatch.setenv('FLASK_DEBUG', 'True')

    with pytest.raises(SystemExit):
        check_production_config(FakeApp(DEBUG=False))


def test_every_problem_is_reported_not_just_the_first(production, monkeypatch, capsys):
    """Fixing one and restarting only to be told about the next is a bad afternoon."""
    monkeypatch.setenv('FLASK_DEBUG', 'True')

    with pytest.raises(SystemExit):
        check_production_config(FakeApp(SECRET_KEY='dev-key', DB_PASSWORD=''))

    reported = capsys.readouterr().err
    assert 'SECRET_KEY' in reported
    assert 'DB_PASSWORD' in reported
    assert 'FLASK_DEBUG' in reported


def test_an_insecure_cookie_warns_but_does_not_stop(production, capsys):
    """
    Someone may be deliberately testing over plain HTTP before certbot has run.
    That is their call — but it must not pass unnoticed, because the symptom
    (nobody can stay signed in, every response a 200) points nowhere near it.
    """
    check_production_config(FakeApp(SESSION_COOKIE_SECURE=False))

    assert 'SESSION_COOKIE_SECURE' in capsys.readouterr().err
