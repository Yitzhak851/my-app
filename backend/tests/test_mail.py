"""
Mail delivery.

The password-reset flow is only useful if the message actually goes somewhere,
and a course project has no mail server. So the transport is swappable, and the
point of these tests is that swapping it changes *only* the transport — the same
message comes out of all three.
"""
import smtplib

import pytest

from app.services.mail_service import MailService


@pytest.fixture
def ctx(app):
    with app.app_context():
        yield app


# ───────────────────────────────────────────────────────────── console ───────

def test_console_is_the_default_backend(ctx, capsys):
    ctx.config.pop('MAIL_BACKEND', None)

    assert MailService.send('dana@example.com', 'Reset', 'http://link') is True

    out = capsys.readouterr().out
    assert 'dana@example.com' in out
    assert 'Reset' in out
    assert 'http://link' in out


def test_console_output_says_the_mail_was_not_really_sent(ctx, capsys):
    """Nobody should spend an afternoon wondering why the inbox is empty."""
    ctx.config['MAIL_BACKEND'] = 'console'

    MailService.send('dana@example.com', 'Reset', 'body')

    assert 'not actually sent' in capsys.readouterr().out


def test_an_unknown_backend_falls_back_to_console_rather_than_failing(ctx, capsys):
    ctx.config['MAIL_BACKEND'] = 'carrier-pigeon'

    assert MailService.send('dana@example.com', 'Reset', 'body') is True
    assert 'dana@example.com' in capsys.readouterr().out


# ──────────────────────────────────────────────────────────────── file ───────

def test_file_backend_writes_the_message(ctx, tmp_path):
    path = tmp_path / 'sent.log'
    ctx.config.update(MAIL_BACKEND='file', MAIL_FILE_PATH=str(path))

    assert MailService.send('dana@example.com', 'Reset', 'http://link') is True

    written = path.read_text(encoding='utf-8')
    assert 'To: dana@example.com' in written
    assert 'Subject: Reset' in written
    assert 'http://link' in written


def test_file_backend_appends_rather_than_overwrites(ctx, tmp_path):
    path = tmp_path / 'sent.log'
    ctx.config.update(MAIL_BACKEND='file', MAIL_FILE_PATH=str(path))

    MailService.send('first@example.com', 'One', 'a')
    MailService.send('second@example.com', 'Two', 'b')

    written = path.read_text(encoding='utf-8')
    assert 'first@example.com' in written and 'second@example.com' in written


# ──────────────────────────────────────────────────────────────── smtp ───────

class FakeSMTP:
    """Records what a real server would have been told to do."""

    last = None

    def __init__(self, host, port, timeout=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.started_tls = False
        self.login_args = None
        self.sent = []
        self.exited = False
        FakeSMTP.last = self

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        self.exited = True
        return False

    def starttls(self):
        self.started_tls = True

    def login(self, username, password):
        self.login_args = (username, password)

    def send_message(self, message):
        self.sent.append(message)


@pytest.fixture
def smtp(monkeypatch):
    FakeSMTP.last = None
    monkeypatch.setattr(smtplib, 'SMTP', FakeSMTP)
    return FakeSMTP


def test_smtp_sends_a_well_formed_message(ctx, smtp):
    ctx.config.update(MAIL_BACKEND='smtp', MAIL_HOST='mail.example.com',
                      MAIL_PORT='2525', MAIL_FROM='no-reply@ybo.local',
                      MAIL_USERNAME='', MAIL_USE_TLS=False)

    assert MailService.send('dana@example.com', 'Reset', 'http://link') is True

    server = smtp.last
    assert (server.host, server.port) == ('mail.example.com', 2525)
    message = server.sent[0]
    assert message['To'] == 'dana@example.com'
    assert message['From'] == 'no-reply@ybo.local'
    assert message['Subject'] == 'Reset'
    assert 'http://link' in message.get_content()


def test_smtp_starts_tls_when_configured(ctx, smtp):
    ctx.config.update(MAIL_BACKEND='smtp', MAIL_USE_TLS=True, MAIL_USERNAME='')

    MailService.send('dana@example.com', 'Reset', 'body')

    assert smtp.last.started_tls is True, 'credentials must not cross the network in the clear'


def test_smtp_skips_login_when_no_username_is_configured(ctx, smtp):
    """Local relays commonly take no credentials; sending '' would be rejected."""
    ctx.config.update(MAIL_BACKEND='smtp', MAIL_USERNAME='', MAIL_USE_TLS=False)

    MailService.send('dana@example.com', 'Reset', 'body')

    assert smtp.last.login_args is None


def test_smtp_logs_in_when_a_username_is_configured(ctx, smtp):
    ctx.config.update(MAIL_BACKEND='smtp', MAIL_USERNAME='me', MAIL_PASSWORD='secret',
                      MAIL_USE_TLS=False)

    MailService.send('dana@example.com', 'Reset', 'body')

    assert smtp.last.login_args == ('me', 'secret')


def test_smtp_closes_the_connection(ctx, smtp):
    ctx.config.update(MAIL_BACKEND='smtp', MAIL_USERNAME='', MAIL_USE_TLS=False)

    MailService.send('dana@example.com', 'Reset', 'body')

    assert smtp.last.exited is True


# ─────────────────────────────────── the reset flow does not leak on failure ─

def test_a_broken_mail_server_does_not_reveal_whether_an_account_exists(db, client, monkeypatch):
    """
    forgot-password must answer identically in every case. If a send failure
    changed the response, the form would become an account-existence oracle.
    """
    db.add_user(email='dana@example.com')

    def explode(*_a, **_k):
        raise OSError('connection refused')

    monkeypatch.setattr(MailService, 'send', staticmethod(explode))

    known = client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})
    unknown = client.post('/api/auth/forgot-password', json={'email': 'nobody@example.com'})

    assert known.status_code == unknown.status_code == 200
    assert known.json == unknown.json
