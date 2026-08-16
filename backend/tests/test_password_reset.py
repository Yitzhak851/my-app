"""
Password reset by emailed link (course requirement 2.a.i).
"""
import hashlib
import re

import bcrypt
import pytest

from app.services.mail_service import MailService


@pytest.fixture
def outbox(monkeypatch):
    """Captures what would have been emailed, instead of printing it."""
    sent = []
    monkeypatch.setattr(
        MailService, 'send',
        staticmethod(lambda to, subject, body: sent.append(
            {'to': to, 'subject': subject, 'body': body}) or True)
    )
    return sent


def token_from(mail):
    match = re.search(r'token=([\w\-]+)', mail['body'])
    assert match, 'the email should contain a reset link'
    return match.group(1)


def _hash(pw):
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


# ────────────────────────────────────────────────────── requesting ──────────

def test_requesting_a_reset_emails_a_link(db, client, outbox):
    db.add_user(email='dana@example.com', name='Dana')

    res = client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})

    assert res.status_code == 200
    assert len(outbox) == 1
    assert outbox[0]['to'] == 'dana@example.com'
    assert '/reset-password?token=' in outbox[0]['body']


def test_an_unknown_address_gets_the_same_answer_and_no_email(db, client, outbox):
    """The response must not reveal who has an account."""
    db.add_user(email='dana@example.com')

    known = client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})
    unknown = client.post('/api/auth/forgot-password', json={'email': 'nobody@example.com'})

    assert known.status_code == unknown.status_code == 200
    assert known.json == unknown.json
    assert [m['to'] for m in outbox] == ['dana@example.com']


def test_only_the_hash_of_the_token_is_stored(db, client, outbox):
    """A stolen database must not let anyone reset a password."""
    db.add_user(email='dana@example.com')
    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})

    token = token_from(outbox[0])
    stored = list(db.resets.keys())

    assert token not in stored
    assert hashlib.sha256(token.encode()).hexdigest() in stored


def test_asking_again_invalidates_the_previous_link(db, client, outbox):
    db.add_user(email='dana@example.com', password_hash=_hash('OldPassword1'))

    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})
    first = token_from(outbox[0])
    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})

    res = client.post('/api/auth/reset-password',
                      json={'token': first, 'password': 'BrandNewPass1'})

    assert res.status_code == 400


# ───────────────────────────────────────────────────────── resetting ────────

def test_a_valid_token_changes_the_password(db, client, outbox):
    uid = db.add_user(email='dana@example.com', password_hash=_hash('OldPassword1'))
    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})

    res = client.post('/api/auth/reset-password',
                      json={'token': token_from(outbox[0]), 'password': 'BrandNewPass1'})

    assert res.status_code == 200
    stored = db.users[uid]['password']
    assert bcrypt.checkpw(b'BrandNewPass1', stored.encode())
    assert not bcrypt.checkpw(b'OldPassword1', stored.encode())


def test_the_new_password_is_stored_hashed(db, client, outbox):
    uid = db.add_user(email='dana@example.com')
    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})
    client.post('/api/auth/reset-password',
                json={'token': token_from(outbox[0]), 'password': 'BrandNewPass1'})

    assert db.users[uid]['password'].startswith('$2b$')


def test_a_token_works_only_once(db, client, outbox):
    db.add_user(email='dana@example.com')
    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})
    token = token_from(outbox[0])

    first = client.post('/api/auth/reset-password',
                        json={'token': token, 'password': 'BrandNewPass1'})
    second = client.post('/api/auth/reset-password',
                         json={'token': token, 'password': 'AnotherPass99'})

    assert first.status_code == 200
    assert second.status_code == 400


def test_an_expired_token_is_rejected(db, client, outbox):
    from datetime import datetime, timedelta
    db.add_user(email='dana@example.com')
    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})
    token = token_from(outbox[0])

    for row in db.resets.values():
        row['expires_at'] = datetime.now() - timedelta(minutes=1)

    res = client.post('/api/auth/reset-password',
                      json={'token': token, 'password': 'BrandNewPass1'})

    assert res.status_code == 400


def test_an_invented_token_is_rejected(db, client):
    db.add_user(email='dana@example.com')
    res = client.post('/api/auth/reset-password',
                      json={'token': 'i-made-this-up', 'password': 'BrandNewPass1'})
    assert res.status_code == 400


def test_every_rejection_gives_the_same_message(db, client, outbox):
    """Expired, used and never-issued must be indistinguishable."""
    from datetime import datetime, timedelta
    db.add_user(email='dana@example.com')
    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})
    token = token_from(outbox[0])
    client.post('/api/auth/reset-password', json={'token': token, 'password': 'BrandNewPass1'})

    used = client.post('/api/auth/reset-password',
                       json={'token': token, 'password': 'Whatever123'})
    invented = client.post('/api/auth/reset-password',
                           json={'token': 'nope', 'password': 'Whatever123'})

    assert used.json['error'] == invented.json['error']


def test_a_short_password_is_rejected(db, client, outbox):
    db.add_user(email='dana@example.com')
    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})

    res = client.post('/api/auth/reset-password',
                      json={'token': token_from(outbox[0]), 'password': 'short'})

    assert res.status_code == 400
    assert 'at least' in res.json['error'].lower()


def test_resetting_signs_out_every_existing_session(db, client, outbox):
    """A stolen session must not survive the password change."""
    uid = db.add_user(email='dana@example.com')
    db.add_session(uid, 'laptop-session')
    db.add_session(uid, 'stolen-session')

    client.post('/api/auth/forgot-password', json={'email': 'dana@example.com'})
    client.post('/api/auth/reset-password',
                json={'token': token_from(outbox[0]), 'password': 'BrandNewPass1'})

    assert 'laptop-session' not in db.sessions
    assert 'stolen-session' not in db.sessions


# ────────────────────────────────────────────────── signup password rule ────

def test_signup_rejects_a_short_password(db, client):
    res = client.post('/api/auth/signup',
                      json={'email': 'new@example.com', 'password': 'abc'})

    assert res.status_code == 400
    assert 'at least' in res.json['error'].lower()
